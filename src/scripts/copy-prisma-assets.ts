/**
 * Copies Prisma's runtime assets into the build output. Runs as part of
 * `npm run build`, after tsc.
 *
 * `prisma generate` writes its client to `src/generated/prisma` — a mix of
 * TypeScript *and* a native query-engine binary (`query_engine-*.node`). tsc
 * only emits the TypeScript half, so a plain `tsc` build produces a
 * `build/generated/prisma` that looks complete but has no engine in it, and
 * `npm run start:api` dies at first query with:
 *
 *   PrismaClientInitializationError: Prisma Client could not locate the Query
 *   Engine for runtime "windows"
 *
 * Dev never hits this — tsx runs straight from `src/`, where the engine sits
 * next to the client — so the gap only shows up in a production start.
 *
 * Anything that isn't a `.ts` file is by definition something tsc won't emit,
 * so that's the copy rule. It also picks up the `.wasm` and `schema.prisma`
 * files other Prisma engine types emit, without needing a per-file allowlist.
 */

import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "generated", "prisma");
const DEST = join(here, "..", "..", "build", "generated", "prisma");

/** Leftovers from a `prisma generate` that was interrupted mid-write. */
const isTemp = (name: string) => name.includes(".tmp");

async function collect(dir: string, acc: string[] = []): Promise<string[]> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await collect(full, acc);
        else if (!entry.name.endsWith(".ts") && !isTemp(entry.name)) acc.push(full);
    }
    return acc;
}

async function main() {
    try {
        await stat(SRC);
    } catch {
        console.error(`[assets] ${relative(process.cwd(), SRC)} not found — run \`npm run prisma:generate\` first.`);
        process.exit(1);
    }

    const files = await collect(SRC);
    if (files.length === 0) {
        console.error("[assets] no Prisma runtime assets found — the client looks incomplete, re-run `npm run prisma:generate`.");
        process.exit(1);
    }

    let bytes = 0;
    for (const file of files) {
        const dest = join(DEST, relative(SRC, file));
        await mkdir(dirname(dest), { recursive: true });
        await cp(file, dest);
        bytes += (await stat(file)).size;
    }

    const mb = (bytes / 1024 / 1024).toFixed(1);
    console.log(`[assets] copied ${files.length} Prisma runtime file(s), ${mb} MB → build/generated/prisma`);
}

main().catch(err => {
    console.error("[assets]", err);
    process.exit(1);
});
