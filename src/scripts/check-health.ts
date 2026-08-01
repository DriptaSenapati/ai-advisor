/**
 * Assert the health score's invariants against whatever real data is in the database.
 *
 *   npm run check:health
 *
 * Read-only, and **deliberately does not run the pipeline**: the score is computed from
 * `MonthlyStats`, `RecurringPattern` and `TransactionFlag`, none of which involve the LLM. So
 * the whole thing can be verified for free, as often as you like, without spending a report.
 *
 * **Determinism is the property worth a script.** A range check fails loudly the first time
 * anyone looks at the screen; a score that quietly moves between two runs over identical data
 * looks exactly like a working number, and the only way to notice is to compute it twice.
 * That is what this does — everything else here is a bound.
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";
import { computeHealthScore, riskLevelFor, scoreAfterPlan } from "../modules/insights/health_score.js";

let failures = 0;

function check(label: string, condition: boolean, detail?: string): void {
    if (condition) {
        console.log(`  ✓ ${label}`);
    } else {
        failures++;
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    }
}

function bandChecks(): void {
    console.log("\nBands");

    check("0 is high risk", riskLevelFor(0) === "high");
    check("44 is high risk", riskLevelFor(44) === "high");
    check("45 is medium risk", riskLevelFor(45) === "medium");
    check("69 is medium risk", riskLevelFor(69) === "medium");
    check("70 is low risk", riskLevelFor(70) === "low");
    check("100 is low risk", riskLevelFor(100) === "low");

    // A perfect account and a ruined one must reach the ends, or the weights are wrong.
    const perfect = computeHealthScore({
        monthly: Array.from({ length: 12 }, (_, i) => ({
            month: `2025-${String(i + 1).padStart(2, "0")}`,
            totalIncome: 100_000,
            totalExpenses: 60_000,
            netSavings: 40_000,
            savingsRate: 40,
        })),
        committedMonthly: 10_000,
        cancellableMonthly: 0,
        flags: [],
    });
    check("an ideal account scores 100", perfect.score === 100, `got ${perfect.score}`);

    /**
     * **A score of exactly 0 is not reachable, and that is correct rather than a gap.**
     *
     * Three of the four drivers bottom out here — nothing is saved, commitments eat 90% of
     * income, and there is more flagged money than a month of spending. `cash_flow` cannot:
     * its volatility half measures how much the monthly figure moves around its own mean, and
     * an account that loses money at a *steady* rate is genuinely predictable. Consistency is
     * worth something even when what is being done consistently is bad, because a predictable
     * deficit is one you can plan your way out of.
     *
     * Pushing this fixture to 0 would mean making the swings enormous — at which point the
     * *median* savings rate turns positive and the first driver starts scoring instead. The
     * two are in tension by construction. So the assertion is the band, not the floor.
     */
    const ruined = computeHealthScore({
        monthly: Array.from({ length: 12 }, (_, i) => ({
            month: `2025-${String(i + 1).padStart(2, "0")}`,
            totalIncome: 100_000,
            totalExpenses: i % 2 === 0 ? 300_000 : 120_000,
            netSavings: i % 2 === 0 ? -200_000 : -20_000,
            savingsRate: i % 2 === 0 ? -200 : -20,
        })),
        committedMonthly: 90_000,
        cancellableMonthly: 0,
        flags: Array.from({ length: 12 }, (_, i) => ({
            severity: "high",
            amount: 500_000,
            transactionId: `t${i}`,
        })),
    });
    check(
        "a ruined account lands deep in the high-risk band",
        ruined.score <= 20 && ruined.riskLevel === "high",
        `got ${ruined.score}/${ruined.riskLevel}`
    );
    check(
        "three of its four drivers score zero",
        ruined.drivers.filter((c) => c.score === 0).length === 3,
        ruined.drivers.map((c) => `${c.key}=${Math.round(c.score)}`).join(" ")
    );
    check(
        "the one that does not is cash flow — a steady loss is still predictable",
        ruined.drivers.find((c) => c.score > 0)?.key === "cash_flow"
    );

    /* ---- the after-plan score ---- */
    const strugglingInput = {
        monthly: Array.from({ length: 12 }, (_, i) => ({
            month: `2025-${String(i + 1).padStart(2, "0")}`,
            totalIncome: 100_000,
            totalExpenses: 98_000,
            netSavings: 2_000,
            savingsRate: 2,
        })),
        committedMonthly: 20_000,
        cancellableMonthly: 4_000,
        flags: [],
    };
    const before = computeHealthScore(strugglingInput);
    const after = scoreAfterPlan(strugglingInput, 25_000);

    check(
        "the plan raises the score",
        after.score > before.score,
        `${before.score} → ${after.score}`
    );
    check(
        "a zero-impact plan changes nothing",
        scoreAfterPlan(strugglingInput, 0).score === before.score
    );
    check(
        "the after-plan score is still in range",
        after.score >= 0 && after.score <= 100,
        `got ${after.score}`
    );
    check(
        "the uplift lands on savings, which is what the plan actually moves",
        (after.drivers.find((d) => d.key === "savings")?.score ?? 0) >
            (before.drivers.find((d) => d.key === "savings")?.score ?? 0)
    );

    /* ---- every driver explains itself ---- */
    check(
        "every driver carries an explanation and a costed improvement",
        before.drivers.every(
            (d) => d.explanation.length > 20 && d.improvement.length > 10 && d.label.length > 0
        ),
        "the score is a report card without them"
    );

    // An empty account must not throw and must not claim to know anything.
    const empty = computeHealthScore({ monthly: [], committedMonthly: 0, cancellableMonthly: 0, flags: [] });
    check(
        "no data yields a score in range rather than NaN",
        Number.isFinite(empty.score) && empty.score >= 0 && empty.score <= 100,
        `got ${empty.score}`
    );
}

function dedupeCheck(): void {
    console.log("\nFlag exposure");

    const base = {
        monthly: Array.from({ length: 6 }, (_, i) => ({
            month: `2025-0${i + 1}`,
            totalIncome: 100_000,
            totalExpenses: 80_000,
            netSavings: 20_000,
            savingsRate: 20,
        })),
        committedMonthly: 20_000,
        cancellableMonthly: 5_000,
    };

    // One payment caught by two detectors is one exposure, not two. `getFlagSummary` made
    // exactly this mistake and overstated "at stake" by 81% on real data.
    const once = computeHealthScore({
        ...base,
        flags: [{ severity: "medium", amount: 40_000, transactionId: "same" }],
    });
    const twice = computeHealthScore({
        ...base,
        flags: [
            { severity: "medium", amount: 40_000, transactionId: "same" },
            { severity: "medium", amount: 40_000, transactionId: "same" },
        ],
    });
    const exposureOf = (r: ReturnType<typeof computeHealthScore>) =>
        r.drivers.find((c) => c.key === "money_at_risk")!.score;

    check(
        "two flags on one transaction count its money once",
        exposureOf(once) === exposureOf(twice),
        `${exposureOf(once)} vs ${exposureOf(twice)}`
    );

    // A pattern-level flag has no transaction to collide with and must count whole.
    const loose = computeHealthScore({
        ...base,
        flags: [
            { severity: "medium", amount: 40_000, transactionId: null },
            { severity: "medium", amount: 40_000, transactionId: null },
        ],
    });
    check(
        "pattern-level flags with no transaction id count separately",
        exposureOf(loose) < exposureOf(once),
        "two distinct pattern findings are twice the exposure of one"
    );
}

async function realDataChecks(): Promise<void> {
    console.log("\nAgainst real data");

    const users = await prisma.monthlyStats.findMany({
        distinct: ["userId"],
        select: { userId: true },
    });

    if (users.length === 0) {
        console.log("  — no MonthlyStats in the database, so nothing to score. Skipped.");
        return;
    }

    for (const { userId } of users) {
        const [monthly, patterns, flags] = await Promise.all([
            prisma.monthlyStats.findMany({ where: { userId }, orderBy: { month: "asc" } }),
            prisma.recurringPattern.findMany({
                where: { userId, isActive: true, OR: [{ type: "debit" }, { type: null }] },
            }),
            prisma.transactionFlag.findMany({ where: { userId } }),
        ]);

        const input = {
            monthly: monthly.map((s) => ({
                month: s.month,
                totalIncome: s.totalIncome,
                totalExpenses: s.totalExpenses,
                netSavings: s.netSavings,
                savingsRate: s.savingsRate,
            })),
            cancellableMonthly: patterns.filter((p) => p.cancellability === "cancellable").reduce((sum, p) => {
                if (p.frequency === "annually") return sum + p.estimatedMonthlyAmount / 12;
                if (p.frequency === "quarterly") return sum + p.estimatedMonthlyAmount / 3;
                return sum + p.estimatedMonthlyAmount;
            }, 0),
            committedMonthly: patterns.reduce((sum, p) => {
                if (p.frequency === "annually") return sum + p.estimatedMonthlyAmount / 12;
                if (p.frequency === "quarterly") return sum + p.estimatedMonthlyAmount / 3;
                return sum + p.estimatedMonthlyAmount;
            }, 0),
            flags: flags.map((f) => ({
                severity: f.severity,
                amount: f.amount,
                transactionId: f.transactionId,
            })),
        };

        const a = computeHealthScore(input);
        const b = computeHealthScore(input);

        console.log(
            `\n  ${userId} — ${monthly.length} months, ${flags.length} flags\n` +
                `    score ${a.score}/100 · ${a.riskLevel}`
        );
        for (const c of a.drivers) {
            console.log(
                `      ${c.label.padEnd(20)} ${String(c.contribution).padStart(3)} / ${String(c.weight).padEnd(3)}  ${c.detail}
        → ${c.improvement}`
            );
        }

        check(
            "same input, same score — twice",
            a.score === b.score && a.riskLevel === b.riskLevel,
            `${a.score}/${a.riskLevel} vs ${b.score}/${b.riskLevel}`
        );
        check("score is in range", a.score >= 0 && a.score <= 100, `got ${a.score}`);
        check(
            "risk level agrees with the score it was banded from",
            a.riskLevel === riskLevelFor(a.score)
        );
        check(
            "the four drivers weight to exactly 100",
            a.drivers.reduce((s, c) => s + c.weight, 0) === 100
        );
        check(
            "every driver is itself in range",
            a.drivers.every((c) => c.score >= 0 && c.score <= 100),
            a.drivers.filter((c) => c.score < 0 || c.score > 100).map((c) => c.key).join(", ")
        );
    }
}

async function main(): Promise<void> {
    bandChecks();
    dedupeCheck();
    await realDataChecks();

    console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    if (failures > 0) process.exitCode = 1;
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        process.exit(process.exitCode ?? 0);
    });
