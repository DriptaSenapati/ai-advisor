/**
 * Database bootstrap, run from `src/api/server.ts` before the API binds its
 * port. Two steps, in order, both idempotent so this is safe to run on every
 * single boot rather than only the first:
 *
 *   1. `prisma db push` — syncs collections and indexes to match schema.prisma.
 *      This is what actually recovers from an emptied database: MongoDB creates
 *      collections implicitly on first insert, but the *indexes* — including
 *      `StatementMetadata.contentHash`'s uniqueness, the upload dedup key —
 *      only come from this step. Confirmed against this project's own dev
 *      database: `Verification` (better-auth's email-verification table, never
 *      once written to) already exists as an empty collection, which only
 *      happens because `db push` walks every model up front rather than waiting
 *      for the app to write to it.
 *
 *   2. The Atlas vector search index — `db push` doesn't manage this one;
 *      Atlas Search indexes are a separate mechanism from the indexes Prisma
 *      controls. createVectorSearchIndex() (src/seeds) checks by name and only
 *      creates it if missing.
 *
 * Only the API runs this, not the worker, and that ordering is sound rather
 * than lucky: the worker's only source of work is a BullMQ job, and the only
 * producer of those jobs is an API route. Since the API doesn't listen until
 * this resolves, no job can exist against an unsynced schema. A worker that
 * boots early just idles on `bzpopmin`.
 *
 * `--skip-generate`: the Prisma Client this process runs was already generated
 * at image-build time into build/generated/prisma (see Dockerfile).
 * Regenerating at runtime would target src/generated/prisma, which doesn't even
 * exist in that image, and wouldn't affect the already-loaded compiled client
 * either way — pure wasted work with a chance to fail on a missing directory.
 *
 * No `--accept-data-loss`. If a schema change is destructive enough that
 * `db push` needs that flag, this is deliberately built to fail rather than
 * decide that unattended, at boot, with no human looking. A server that refuses
 * to start beats one that silently drops a collection.
 */

import "../envConfig.js";
import { spawn } from "node:child_process";

const log = (msg: string) => console.log(`[bootstrap] ${msg}`);

/** Thrown rather than exiting here — the caller owns the process lifecycle. */
class BootstrapError extends Error {}

function run(cmd: string, args: string[]): Promise<number> {
    return new Promise(resolve => {
        // Windows only: `npx` there is `npx.cmd`, a batch shim `spawn` cannot
        // execute directly without shell interpretation. (Contrast
        // ensure-redis.ts's `docker`, a real .exe that never needs this.) On
        // Linux `npx` is a plain executable, so the shell is both unnecessary
        // and undesirable — passing it unconditionally printed a DEP0190
        // deprecation warning into the API's production startup log on every
        // container boot. Safe either way: every argument is a hardcoded
        // literal, never user input.
        const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
        // Surfaced, not swallowed: the first time this shipped, a spawn failure
        // on Windows resolved straight to exit 1 with zero explanation printed —
        // "prisma db push failed, see the output above" with nothing above it.
        child.on("error", err => {
            console.error(`[bootstrap] failed to launch \`${cmd}\`:`, err.message);
            resolve(1);
        });
        child.on("close", code => resolve(code ?? 1));
    });
}

/**
 * Resolves once the database matches schema.prisma and the vector search index
 * exists. Rejects if either step fails — the caller is expected to treat that
 * as fatal and not start serving.
 *
 * Set `SKIP_DB_BOOTSTRAP=true` to bypass entirely. That exists for the fast dev
 * inner loop: nodemon restarts on every file save, and each restart otherwise
 * pays a couple of Atlas round-trips it didn't used to. Skipping is safe only
 * because dev still has `npm run prisma:push` as a manual tool.
 */
export async function bootstrapDatabase(): Promise<void> {
    if (process.env.SKIP_DB_BOOTSTRAP === "true") {
        log("SKIP_DB_BOOTSTRAP=true — skipping schema sync and index check.");
        return;
    }

    log("syncing schema (prisma db push)...");
    const pushCode = await run("npx", ["prisma", "db", "push", "--skip-generate"]);
    if (pushCode !== 0) {
        throw new BootstrapError(
            "`prisma db push` failed — see the output above.\n" +
                "        If it's refusing over potential data loss, that needs a human decision:\n" +
                "        run `npx prisma db push --accept-data-loss` yourself once you've reviewed the diff."
        );
    }
    log("schema in sync.");

    log("checking vector search index...");
    const { default: createVectorSearchIndex } = await import("../seeds/create_vector_search_index.js");
    await createVectorSearchIndex();
    log("vector search index ready.");
}

export default bootstrapDatabase;
