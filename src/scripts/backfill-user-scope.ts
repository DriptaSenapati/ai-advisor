/**
 * Backfill `userId` onto the aggregate collections.
 *
 * `FinalTransactionData`, `Cluster`, `MonthlyStats`, `RecurringPattern` and
 * `InsightReport` gained a **required** `userId`. Documents written before that
 * have no such field, and Prisma refuses to deserialise a document missing a
 * required scalar — so without this every one of those rows becomes unreadable
 * the moment the new client is used. Run it **before** `prisma db push`, so the
 * new unique indexes are built against complete documents.
 *
 * Ownership is derived rather than assumed wherever it can be:
 *
 *   FinalTransactionData → its statement's userId (via statementMetadataId)
 *   Cluster              → the owner of the transactions pointing at it
 *   MonthlyStats         → the sole user (see below)
 *   RecurringPattern     → the sole user
 *   InsightReport        → the sole user
 *
 * **The last three can only be backfilled when exactly one user has statements**,
 * and this refuses to guess otherwise. Those collections were computed from every
 * user's transactions blended together; if two users' data went into a
 * `MonthlyStats` row there is no key anywhere that says which parts belonged to
 * whom. Assigning the row to somebody would be inventing an answer and would hand
 * one user another's figures. The honest recovery in that case is to delete them
 * and re-run `POST /insights/generate` per user, which recomputes from
 * `FinalTransactionData` — which *is* recoverable, because it points at a
 * statement that names its owner.
 *
 *   npm run backfill:user-scope            # report only
 *   npm run backfill:user-scope -- --yes   # actually write
 */
import "../envConfig.js";
import prisma from "../prismaClient.js";

const APPLY = process.argv.includes("--yes");

type Counted = { _id: string | null; count: number };

async function missingCount(collection: string): Promise<number> {
    const res = (await prisma.$runCommandRaw({
        count: collection,
        query: { userId: { $exists: false } },
    })) as unknown as { n?: number };
    return res.n ?? 0;
}

async function setUserId(collection: string, filter: Record<string, unknown>, userId: string) {
    if (!APPLY) return 0;
    const res = (await prisma.$runCommandRaw({
        update: collection,
        updates: [{ q: { ...filter, userId: { $exists: false } }, u: { $set: { userId } }, multi: true }],
    })) as unknown as { nModified?: number };
    return res.nModified ?? 0;
}

/* ---------------------------------------------------------------- statements */

const owners = (await prisma.statementMetadata.aggregateRaw({
    pipeline: [{ $group: { _id: "$userId", count: { $sum: 1 } } }],
})) as unknown as Counted[];

const realOwners = owners.filter((o) => o._id);
console.log(`Statement owners: ${realOwners.map((o) => `${o._id} (${o.count})`).join(", ") || "none"}`);

if (realOwners.length === 0) {
    console.error("No statements carry a userId — nothing to derive ownership from. Aborting.");
    await prisma.$disconnect();
    process.exit(1);
}

/* ------------------------------------------------- FinalTransactionData */

const statements = await prisma.statementMetadata.findMany({ select: { id: true, userId: true } });
let txnUpdated = 0;

for (const s of statements) {
    if (!s.userId) continue;
    txnUpdated += await setUserId(
        "FinalTransactionData",
        { statementMetadataId: { $oid: s.id } },
        s.userId
    );
}
console.log(`FinalTransactionData: ${APPLY ? `${txnUpdated} updated` : `${await missingCount("FinalTransactionData")} would be updated`}`);

/* ------------------------------------------------------------------ Cluster */

/**
 * A cluster's owner is whoever owns the transactions in it. Read *after* the
 * transaction backfill above so the userId is there to read.
 */
const clusterOwners = (await prisma.finalTransactionData.aggregateRaw({
    pipeline: [
        { $match: { clusterId: { $ne: null }, userId: { $exists: true } } },
        { $group: { _id: { cluster: "$clusterId", user: "$userId" } } },
    ],
})) as unknown as { _id: { cluster: { $oid: string }; user: string } }[];

let clusterUpdated = 0;
const byUser = new Map<string, string[]>();
for (const row of clusterOwners) {
    const list = byUser.get(row._id.user) ?? [];
    list.push(row._id.cluster.$oid);
    byUser.set(row._id.user, list);
}
for (const [userId, ids] of byUser) {
    clusterUpdated += await setUserId(
        "Cluster",
        { _id: { $in: ids.map((id) => ({ $oid: id })) } },
        userId
    );
}
console.log(`Cluster: ${APPLY ? `${clusterUpdated} updated` : `${await missingCount("Cluster")} would be updated`}`);

/* ------------------------------- global aggregates — single tenant only ---- */

const GLOBAL = ["MonthlyStats", "RecurringPattern", "InsightReport"] as const;
const pending = await Promise.all(GLOBAL.map((c) => missingCount(c)));
const totalPending = pending.reduce((a, b) => a + b, 0);

if (totalPending > 0 && realOwners.length > 1) {
    console.error(
        `\n${totalPending} row(s) across ${GLOBAL.join("/")} have no userId, but ${realOwners.length} users have statements.\n` +
        `These were computed from every user's transactions blended together and carry no key saying whose is whose.\n` +
        `Assigning them would hand one user another's figures. Delete them and re-run POST /insights/generate per user instead.`
    );
    await prisma.$disconnect();
    process.exit(1);
}

const soleOwner = realOwners[0]!._id!;
for (const collection of GLOBAL) {
    const n = await setUserId(collection, {}, soleOwner);
    const idx = GLOBAL.indexOf(collection);
    console.log(`${collection}: ${APPLY ? `${n} updated` : `${pending[idx]} would be updated`} → ${soleOwner}`);
}

/* ------------------------------------------------------------------ orphans */

const orphans = await missingCount("FinalTransactionData");
if (APPLY && orphans > 0) {
    console.warn(
        `\n⚠  ${orphans} FinalTransactionData row(s) still have no userId — their statementMetadataId ` +
        `points at a statement that no longer exists, or at one with a null userId. They are unreachable ` +
        `by every user-scoped query and safe to delete.`
    );
}

console.log(APPLY ? "\nDone." : "\nDry run. Re-run with -- --yes to apply.");
await prisma.$disconnect();
process.exit(0);
