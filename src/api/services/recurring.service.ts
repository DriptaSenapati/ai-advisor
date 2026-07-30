import type { Prisma } from "../../generated/prisma/client.js";
import prisma from "../../prismaClient.js";
import { NotFoundError, assertValidObjectId } from "../errors.js";

/**
 * Read access to `RecurringPattern`.
 *
 * Until this existed the model had **no REST route at all**: five detection passes, IQR income
 * ranges, `cancellability`, `creditLabel` and `frequency` were all computed, persisted, and
 * reachable only as `chartData.recurringPatterns` inside the insight blob — where `id` and
 * `lastTransactionDate` are dropped and inactive rows are filtered out. So there was no stable
 * key to expand a row by, no last-seen date, and no way to see a lapsed subscription.
 *
 * Every function takes `userId` first and filters on it. `transactions.service.ts` documents
 * what happened the last time an aggregate read here did not.
 */

/**
 * `debit` must also match `type: null`.
 *
 * The column was added after the first patterns were written and carries
 * `@default("debit")`, which Prisma applies on *write* — existing documents were never
 * backfilled and have no field. `{ type: "debit" }` therefore hides them, and on a database
 * that predates the column that is every debit pattern the user has.
 */
function typeFilter(type: "debit" | "credit" | "all"): Prisma.RecurringPatternWhereInput {
    if (type === "credit") return { type: "credit" };
    if (type === "debit") return { OR: [{ type: "debit" }, { type: null }] };
    return {};
}

function activeFilter(active: "true" | "false" | "all"): Prisma.RecurringPatternWhereInput {
    if (active === "all") return {};
    return { isActive: active === "true" };
}

/**
 * When the next charge is due, derived from the last one plus the detected frequency.
 *
 * Derived rather than stored: `frequency` and `lastTransactionDate` are both persisted and
 * the answer follows from them, so a stored column would be a third thing to keep in sync
 * and would go stale the moment either input changed.
 *
 * Null when `lastTransactionDate` is null — legacy rows predate that field, and a guessed
 * date on a screen about money would be worse than an honest blank.
 */
function nextExpectedDate(last: Date | null, frequency: string): Date | null {
    if (!last) return null;
    const months = frequency === "annually" ? 12 : frequency === "quarterly" ? 3 : 1;
    const d = new Date(last);
    d.setMonth(d.getMonth() + months);
    return d;
}

export interface ListRecurringFilters {
    page: number;
    limit: number;
    type: "debit" | "credit" | "all";
    active: "true" | "false" | "all";
}

export async function listRecurring(userId: string, filters: ListRecurringFilters) {
    const { page, limit, type, active } = filters;
    const where: Prisma.RecurringPatternWhereInput = {
        userId,
        ...typeFilter(type),
        ...activeFilter(active),
    };

    const [total, rows] = await Promise.all([
        prisma.recurringPattern.count({ where }),
        prisma.recurringPattern.findMany({
            where,
            orderBy: { estimatedMonthlyAmount: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);

    const data = rows.map(r => ({
        ...r,
        // Legacy rows have no `type`; the schema default says what they are.
        type: r.type ?? "debit",
        name: r.merchantName ?? r.payeeName ?? null,
        kind: r.merchantName ? "merchant" : r.payeeName ? "person" : "unnamed",
        nextExpectedDate: nextExpectedDate(r.lastTransactionDate, r.frequency),
    }));

    return { data, total };
}

/**
 * Roll-ups over every pattern, plus the price history the detector's keying makes visible.
 *
 * **`isActive` is the whole de-duplication, and two active rows for one counterparty must
 * both be counted.** This is worth stating because the opposite looks obviously right and is
 * wrong. Detection keys a debit on its exact amount, so a price change does write a second
 * row — but so does a *second parallel commitment* to the same counterparty, and on real data
 * that is the more common case: "Indian Clearing" runs at ₹4,000 and ₹2,000, both for 11
 * months, both still charging; "Google Play" bills ₹149 and ₹99 for two different
 * subscriptions across 12 months each. Collapsing to the newest amount per name hid ₹4,149 a
 * month of genuine commitment.
 *
 * What actually distinguishes the two is **overlap in time**, which `isActive` already
 * encodes: a superseded price *stops appearing* and the deactivation sweep retires it, while
 * parallel commitments keep arriving together. So a name with one active and one inactive row
 * is a price change (Compass India: ₹21 retired, ₹42 live), and a name with two active rows is
 * two commitments.
 */
export async function getRecurringSummary(userId: string) {
    const all = await prisma.recurringPattern.findMany({ where: { userId } });

    const isDebit = (p: typeof all[number]) => (p.type ?? "debit") === "debit";
    const debits = all.filter(isDebit);
    const credits = all.filter(p => p.type === "credit");
    const activeDebits = debits.filter(p => p.isActive);
    const activeCredits = credits.filter(p => p.isActive);

    /** A quarterly ₹3,000 charge is ₹1,000/month of commitment, not ₹3,000. */
    const perMonth = (p: typeof all[number]) =>
        p.frequency === "annually" ? p.estimatedMonthlyAmount / 12
            : p.frequency === "quarterly" ? p.estimatedMonthlyAmount / 3
                : p.estimatedMonthlyAmount;

    const byCancellability: Record<string, { count: number; monthly: number }> = {};
    for (const p of activeDebits) {
        const key = p.cancellability ?? "unknown";
        const slot = byCancellability[key] ?? { count: 0, monthly: 0 };
        slot.count += 1;
        slot.monthly += perMonth(p);
        byCancellability[key] = slot;
    }
    for (const key of Object.keys(byCancellability)) {
        byCancellability[key]!.monthly = Math.round(byCancellability[key]!.monthly);
    }

    const byCreditLabel: Record<string, { count: number; monthly: number }> = {};
    for (const p of activeCredits) {
        const key = p.creditLabel ?? "unknown";
        const slot = byCreditLabel[key] ?? { count: 0, monthly: 0 };
        slot.count += 1;
        slot.monthly += perMonth(p);
        byCreditLabel[key] = slot;
    }
    for (const key of Object.keys(byCreditLabel)) {
        byCreditLabel[key]!.monthly = Math.round(byCreditLabel[key]!.monthly);
    }

    const cancellableMonthly = activeDebits
        .filter(p => p.cancellability === "cancellable")
        .reduce((s, p) => s + perMonth(p), 0);

    // ── Price history ────────────────────────────────────────────────────────
    //
    // A price change is **one retired amount replaced by one live amount** for the same
    // counterparty. Both halves of that are required, and requiring them is the whole
    // correctness of this block.
    //
    // Two *active* rows are two parallel commitments, not a change — sorting all rows for a
    // name by date and diffing the last two reported "Indian Clearing rose ₹2,000 → ₹4,000"
    // when in fact both mandates run side by side and always have, and it labelled Google
    // Play's two separate subscriptions as a price cut. Both rows even shared a
    // `lastTransactionDate`, so the ordering that produced the claim was arbitrary.
    //
    // Restricting to `inactive → active` means supersession is inferred from the thing that
    // actually signals it: the old amount stopped arriving and the sweep retired it.
    const retired = new Map<string, typeof all>();
    const live = new Map<string, typeof all>();
    for (const p of debits) {
        const name = p.merchantName ?? p.payeeName;
        if (!name) continue;
        const bucket = p.isActive ? live : retired;
        const list = bucket.get(name) ?? [];
        list.push(p);
        bucket.set(name, list);
    }

    const priceChanges = [...retired.entries()]
        .flatMap(([name, oldRows]) => {
            const current = live.get(name);
            // Exactly one live amount. With two the mapping from old to new is a guess, and
            // a guess about someone's money is not worth printing.
            if (!current || current.length !== 1) return [];
            const now = current[0]!;

            // The most recently retired amount is the one it replaced.
            const previous = [...oldRows].sort(
                (a, b) => (a.lastTransactionDate?.getTime() ?? 0) - (b.lastTransactionDate?.getTime() ?? 0)
            )[oldRows.length - 1]!;

            if (previous.estimatedMonthlyAmount === now.estimatedMonthlyAmount) return [];

            return [{
                name,
                category: now.category,
                oldAmount: previous.estimatedMonthlyAmount,
                newAmount: now.estimatedMonthlyAmount,
                deltaPct: previous.estimatedMonthlyAmount > 0
                    ? Number((((now.estimatedMonthlyAmount - previous.estimatedMonthlyAmount) / previous.estimatedMonthlyAmount) * 100).toFixed(1))
                    : 0,
                since: now.lastTransactionDate,
                frequency: now.frequency,
            }];
        })
        .sort((a, b) => Math.abs(b.newAmount - b.oldAmount) - Math.abs(a.newAmount - a.oldAmount));

    return {
        committedMonthly: Math.round(activeDebits.reduce((s, p) => s + perMonth(p), 0)),
        cancellableMonthly: Math.round(cancellableMonthly),
        annualisedCancellable: Math.round(cancellableMonthly * 12),
        byCancellability,
        byCreditLabel,
        // The floor the user can count on: the bottom of each income source's IQR range,
        // not its median. `rangeMin` is null for a debit and for legacy credit rows, so
        // fall back to the median rather than contributing zero.
        incomeFloor: Math.round(activeCredits.reduce((s, p) => s + (p.rangeMin ?? p.estimatedMonthlyAmount), 0)),
        incomeMedian: Math.round(activeCredits.reduce((s, p) => s + p.estimatedMonthlyAmount, 0)),
        counts: {
            activeDebits: activeDebits.length,
            inactiveDebits: debits.length - activeDebits.length,
            activeCredits: activeCredits.length,
            inactiveCredits: credits.length - activeCredits.length,
        },
        priceChanges,
    };
}

/**
 * The transactions a pattern was detected from.
 *
 * There is no stored link between a pattern and its occurrences — `RecurringPattern` records
 * no transaction ids — so this reconstructs the match with the same predicate the detector
 * used. That mirroring is deliberate and the reason the two halves must change together: a
 * debit pattern is `merchantName`/`payeeName` **plus the exact amount** (which is why a price
 * change makes a new row), while a credit pattern is name-or-cluster only, since income
 * varies month to month and is matched on an IQR range instead.
 */
export async function getRecurringTransactions(
    id: string,
    userId: string,
    page: number,
    limit: number,
) {
    assertValidObjectId(id);
    const pattern = await prisma.recurringPattern.findFirst({ where: { id, userId } });
    if (!pattern) throw new NotFoundError("RecurringPattern", id);

    const isDebit = (pattern.type ?? "debit") === "debit";

    const clusterWhere = pattern.clusterKey
        ? { id: pattern.clusterKey }
        : pattern.merchantName
            ? { merchantName: pattern.merchantName }
            : { merchantName: null, payeeName: pattern.payeeName };

    const clusters = await prisma.cluster.findMany({
        where: { userId, ...clusterWhere },
        select: { id: true },
    });
    if (clusters.length === 0) return { data: [], total: 0, pattern };

    const where = {
        userId,
        clusterId: { in: clusters.map(c => c.id) },
        ...(isDebit
            ? { debitAmount: pattern.estimatedMonthlyAmount }
            : { creditAmount: { gt: 0 } }),
    };

    const [total, data] = await Promise.all([
        prisma.finalTransactionData.count({ where }),
        prisma.finalTransactionData.findMany({
            where,
            orderBy: { date: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true, date: true, description: true,
                debitAmount: true, creditAmount: true, balance: true,
            },
        }),
    ]);

    return { data, total, pattern };
}
