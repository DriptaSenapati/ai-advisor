import "../envConfig.js";
import prisma from "../prismaClient.js";
import { createPayeeMatcher, groupPayees, segmentName, buildVocabulary } from "../modules/graphTools/insights_gen_tools/payee_canonicalizer_tool.js";
import { jaroWinkler, normaliseName, soundsAlike } from "../modules/text/similarity.js";

/**
 * Payee canonicalisation — prints what would merge; writes only with `--yes`.
 *
 * `npm run check:payees` (add `-- --user=<id>` to scope it, `-- --yes` to apply).
 *
 * Dry by default because the cost of a wrong merge is money attributed to the wrong person,
 * which no amount of unit testing on invented names can rule out: the only convincing evidence
 * is the real spellings an account actually holds.
 *
 * `--yes` exists so a rule change can be applied to existing data without paying for a full
 * LLM regeneration. It performs exactly the writes `payeeCanonicalizerTool` would, and the
 * pipeline stays the normal path — this is the out-of-band repair, in the same spirit as
 * `repair:categories`. **It does not recompute aggregates**: `MonthlyStats.topMerchants`,
 * `RecurringPattern` and the report were all derived while the names were still split, so it
 * prints the regeneration needed to make them agree.
 */
async function main() {
    const userArg = process.argv.find((a) => a.startsWith("--user="))?.split("=")[1];
    const apply = process.argv.includes("--yes");

    const clusters = await prisma.cluster.findMany({
        where: { payeeName: { not: null }, ...(userArg ? { userId: userArg } : {}) },
        select: { id: true, payeeName: true, clusterLength: true, userId: true },
    });

    const byUser = new Map<string, typeof clusters>();
    for (const c of clusters) {
        if (!byUser.has(c.userId)) byUser.set(c.userId, []);
        byUser.get(c.userId)!.push(c);
    }

    const sweep = process.argv.includes("--sweep");

    for (const [userId, rows] of byUser) {
        const byName = new Map<string, { name: string; weight: number; clusterIds: string[] }>();
        for (const c of rows) {
            const name = c.payeeName?.trim();
            if (!name) continue;
            const e = byName.get(name);
            if (e) {
                e.weight += c.clusterLength ?? 1;
                e.clusterIds.push(c.id);
            } else byName.set(name, { name, weight: c.clusterLength ?? 1, clusterIds: [c.id] });
        }

        const variants = [...byName.values()];
        const names = variants.map((v) => v.name);
        const vocab = buildVocabulary(names);

        /**
         * Every setting, side by side, on the same real data.
         *
         * A threshold argued about in the abstract is a threshold nobody can defend. This
         * prints what each one actually merges so the choice is made by reading names.
         */
        if (sweep) {
            /**
             * Spellings this account no longer holds, because earlier runs already merged them.
             *
             * Re-injected so a threshold can still be judged against the cases that motivated
             * it — otherwise the sweep runs over already-canonical data and every setting looks
             * identical. The live 165 names come along too, so a lowered threshold still has
             * every real opportunity to produce a false positive.
             */
            const RETIRED = [
                "Runu Senapa", "Runusenapati", "Senapati D", "Senapatid",
                "Driptasenapati", "Mr Dripta Senap", "Mrdriptasenapat",
                "Hrishitaghosh", "Mr Rik Singha",
            ];
            for (const name of RETIRED) {
                if (!byName.has(name)) byName.set(name, { name, weight: 1, clusterIds: [] });
            }
            variants.length = 0;
            variants.push(...byName.values());

            console.log(`\n=== sweep · user ${userId} · ${variants.length} spellings (incl. ${RETIRED.length} re-injected) ===`);
            const settings = [
                { label: "jw 0.90            ", tokenThreshold: 0.9, phonetic: false },
                { label: "jw 0.90 + metaphone", tokenThreshold: 0.9, phonetic: true },
                { label: "jw 0.85            ", tokenThreshold: 0.85, phonetic: false },
                { label: "jw 0.85 + metaphone", tokenThreshold: 0.85, phonetic: true },
                { label: "jw 0.80 + metaphone", tokenThreshold: 0.8, phonetic: true },
            ];
            const baseline = new Set(
                groupPayees(variants, settings[0]).filter((g) => g.members.length > 1)
                    .map((g) => g.members.map((m) => m.name).sort().join(" | "))
            );
            for (const s of settings) {
                const gs = groupPayees(variants, s).filter((g) => g.members.length > 1);
                const keys = gs.map((g) => g.members.map((m) => m.name).sort().join(" | "));
                const added = keys.filter((k) => !baseline.has(k));
                console.log(`\n  ${s.label} → ${gs.length} merged group(s)`);
                for (const k of added) console.log(`      + ${k}`);
                if (added.length === 0 && s !== settings[0]) console.log("      (no change from jw 0.90)");
            }

            /**
             * Why the threshold barely matters: what actually sits in the band it moves.
             *
             * If no real token pair scores between 0.80 and 0.95, then choosing 0.85 over 0.90
             * is choosing between two lines drawn through empty space — and the merges are
             * being decided by the structural guards instead. Printing the band is the only way
             * to know which.
             */
            const vocabAll = buildVocabulary(variants.map((v) => v.name));
            const band: string[] = [];
            for (let i = 0; i < vocabAll.length; i++) {
                for (let j = i + 1; j < vocabAll.length; j++) {
                    const a = vocabAll[i]!, b = vocabAll[j]!;
                    if (a.startsWith(b) || b.startsWith(a)) continue;   // the prefix rule owns these
                    const s = jaroWinkler(a, b);
                    if (s >= 0.8 && s < 0.95) band.push(`      ${a} ⟷ ${b}  jw=${s.toFixed(4)}${soundsAlike(a, b) ? "  (same metaphone)" : ""}`);
                }
            }
            console.log(`\n  token pairs in the 0.80–0.95 band — what a threshold move actually decides (${band.length}):`);
            band.sort().forEach((l) => console.log(l));

            const phoneticOnly: string[] = [];
            for (let i = 0; i < vocabAll.length; i++) {
                for (let j = i + 1; j < vocabAll.length; j++) {
                    const a = vocabAll[i]!, b = vocabAll[j]!;
                    if (a.startsWith(b) || b.startsWith(a)) continue;
                    if (jaroWinkler(a, b) >= 0.8) continue;
                    if (soundsAlike(a, b)) phoneticOnly.push(`      ${a} ⟷ ${b}  jw=${jaroWinkler(a, b).toFixed(4)}`);
                }
            }
            console.log(`\n  pairs Double Metaphone alone would join (${phoneticOnly.length}):`);
            phoneticOnly.sort().forEach((l) => console.log(l));
            continue;
        }

        const isSame = createPayeeMatcher(names);
        const groups = groupPayees(variants);
        const merged = groups.filter((g) => g.members.length > 1);

        console.log(`\n=== user ${userId} — ${variants.length} spelling(s) → ${groups.length} payee(s) ===`);
        for (const g of merged) {
            console.log(`\n  ${g.canonical}`);
            for (const m of g.members) {
                const score = jaroWinkler(normaliseName(g.canonical), normaliseName(m.name)).toFixed(4);
                const seg = segmentName(m.name, vocab).join("+");
                console.log(
                    `    ${m.name === g.canonical ? "→" : " "} ${m.name.padEnd(30)} w=${String(m.weight).padStart(4)}  jw=${score}  [${seg}]`
                );
            }
        }
        if (merged.length === 0) console.log("  nothing would merge");

        /**
         * Pairs that scored high on raw Jaro-Winkler and were *rejected*.
         *
         * The half of the output worth reading closely: every line here is a merge a naive
         * similarity threshold would have made. Whole-string JW is no longer part of the
         * decision, so this is now purely a report on what the token rules are protecting
         * against — `RUNU SENAPATI` ⟷ `RUMA SENAPATI` being the one that matters.
         */
        const rejected: string[] = [];
        for (let i = 0; i < variants.length; i++) {
            for (let j = i + 1; j < variants.length; j++) {
                const a = variants[i]!.name, b = variants[j]!.name;
                const jw = jaroWinkler(normaliseName(a), normaliseName(b));
                if (jw >= 0.92 && !isSame(a, b)) rejected.push(`    ${a} ⟷ ${b}  jw=${jw.toFixed(4)}`);
            }
        }
        if (rejected.length > 0) {
            console.log(`\n  high similarity but kept apart:`);
            rejected.forEach((r) => console.log(r));
        }

        if (!apply) continue;

        let rewritten = 0;
        for (const g of merged) {
            const stale = g.members.filter((m) => m.name !== g.canonical);
            const ids = stale.flatMap((m) => m.clusterIds);
            if (ids.length === 0) continue;
            // Scoped by userId as well as id, like every write in this project.
            const { count } = await prisma.cluster.updateMany({
                where: { id: { in: ids }, userId },
                data: { payeeName: g.canonical },
            });
            rewritten += count;

            // Provenance, written before the old spelling stops existing — see the model.
            for (const m of stale) {
                await prisma.payeeAlias.upsert({
                    where: { userId_alias: { userId, alias: m.name } },
                    create: { userId, canonical: g.canonical, alias: m.name, txnCount: m.weight },
                    update: { canonical: g.canonical, txnCount: m.weight },
                });
            }
            await prisma.payeeAlias.updateMany({
                where: { userId, canonical: { in: stale.map((m) => m.name) } },
                data: { canonical: g.canonical },
            });
        }
        console.log(`\n  APPLIED — ${rewritten} cluster(s) rewritten.`);
        if (rewritten > 0) {
            console.log(
                "  Aggregates still hold the old names. Run POST /insights/generate (no statementId)\n" +
                "  to rebuild MonthlyStats, recurring patterns, flags and the report."
            );
        }
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
