import { tool } from "langchain";
import z from "zod";
import prisma from "../../../prismaClient.js";
import { jaroWinkler, normaliseName, soundsAlike, tokens } from "../../text/similarity.js";

/**
 * One person, one name.
 *
 * ---
 *
 * A bank narration is not a database field. The same payee arrives as
 * `MAHADWIP MONDA`, `Mahadwip M`, `MAHADWIP MONDA UPI` and `Mahadwip  Monda`
 * across a year of statements, and because `payeeName` is extracted per cluster
 * from the description, each variant becomes its own row. Everything downstream
 * then treats them as separate people: `RecurringPattern` keys on
 * merchant/payee + amount so a recurring transfer splits into two patterns that
 * each fail the ≥3-month test, `/transactions/merchants` ranks the same person
 * twice at a fraction of their real total, and the insights prompt names them as
 * unrelated counterparties.
 *
 * **Payees only, never merchants — this only ever writes `Cluster.payeeName`.**
 * Merchant names come from a bounded, well-known vocabulary the LLM already
 * normalises, and fuzzy-merging them is actively dangerous: "Google Play" and
 * "Google Pay" are different products at 0.96 Jaro-Winkler, "Airtel" and
 * "Airtel Payments Bank" are different businesses. Human names are the case
 * where the variants are genuinely the same entity and the edit distance is
 * genuinely noise.
 *
 * Runs at the head of the insights graph, so it is in front of every consumer of
 * these names — `statsAggregatorTool`'s `topMerchants`, `recurringPatternTool`'s
 * payee passes, `redFlagDetectorTool` and the prompt itself. It is also why a
 * user with already-split payees can fix their history by regenerating rather
 * than re-uploading.
 */

/**
 * Per-token floor, for OCR-grade noise inside a single word.
 *
 * **0.90, and 0.85 was measured and rejected.** The band a threshold move actually decides is
 * printed by `npm run check:payees -- --sweep`, and between 0.85 and 0.90 it is full of
 * distinct people:
 *
 *     subhojit ⟷ surojit  0.8952      subhajit ⟷ subhas  0.8917
 *     subhankar ⟷ subhas  0.8778      swapan ⟷ swain     0.8756
 *     sultan ⟷ suman      0.8578      sharma ⟷ samar     0.8600
 *
 * At 0.85 those pairs become "the same word", and a shared surname is then enough to merge two
 * people: `Subhas Ghosh` and `Subhajit Ghosh` would anchor on `ghosh`, match on 0.8917, satisfy
 * full coverage, and become one payee. No such pair exists in the data *today*, which is why
 * the sweep shows 0.85 and 0.90 producing identical output — but that is the guards holding,
 * not the threshold being safe.
 *
 * **There is deliberately no whole-name floor any more.** There used to be one — Jaro-Winkler
 * ≥ 0.92 over the full string — and it was the thing keeping `SENAPATI D` and
 * `DRIPTA SENAPATI` apart. Those are one person written surname-first with an initial, and no
 * whole-string measure can bridge that: the tokens are transposed *and* one is abbreviated to
 * a single character, so the strings genuinely are dissimilar. The similarity question only
 * has a meaningful answer per token; asking it of the whole name conflated "spelled
 * differently" with "written in a different order", and answered no to both.
 */
const TOKEN_THRESHOLD = 0.9;

/**
 * Double Metaphone: implemented, tested against this account, and **off**.
 *
 * It is the standard recommendation for name matching and it is the wrong tool for these
 * names. `npm run check:payees -- --sweep` lists every pair it would join that string
 * similarity would not — 29 of them, and they are almost all different people:
 *
 *     aich ⟷ egg      jeet ⟷ adi      raj ⟷ roy       chow ⟷ shaw
 *     khan ⟷ kun      mintu ⟷ monda   ghosh ⟷ kushe   daw ⟷ the
 *
 * Two are genuine (`hussain`/`hossen`). The rules encode English phonology, and on Bengali and
 * other Indian transliterations they collapse distinct short names onto the same code far more
 * readily than they rescue a real variant. The variants it *would* rescue — `Senapati`/
 * `Senapathi`, `Ghosh`/`Ghose` — already score above the Jaro-Winkler floor without it, so it
 * adds risk and no recall on this data.
 *
 * Kept rather than deleted because the code is small, the option is per-call, and a dataset of
 * Western names is exactly where this earns its reputation. Flip it with `{ phonetic: true }`
 * and re-run the sweep before trusting it.
 */
const PHONETIC_DEFAULT = false;

/** Anchor floor — a matched pair this close, on tokens this long, is what licenses a merge. */
const ANCHOR_THRESHOLD = 0.92;
const ANCHOR_MIN_LENGTH = 4;

/** At or below this length a token is an initial, not a word. */
const INITIAL_MAX_LENGTH = 2;

/** Below this a "name" is an artefact, not a name — never a merge candidate. */
const MIN_NAME_LENGTH = 3;

/** Shortest run of characters worth trying to split into words. */
const MIN_SEGMENTABLE_LENGTH = 6;

/**
 * Titles that some narrations carry and others don't, for the same person.
 *
 * Stripped before comparison because positional token alignment is otherwise
 * defeated by a single leading word: on real data `Mr Dripta Senap` and
 * `Dripta Senapati` are one person, and lining `mr` up against `dripta` rejected
 * them. A closed list, and deliberately a short one — `md` is left out because
 * it is far more often the start of a name than an abbreviation of "Doctor".
 */
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "shri", "sri", "smt"]);

/**
 * A payee's tokens with any leading honorifics removed.
 *
 * Never strips down to nothing: a payee genuinely recorded as just `Mr` keeps
 * that as its only token rather than becoming an empty name that matches
 * everything.
 */
function payeeTokens(name: string): string[] {
    const all = tokens(name);
    let i = 0;
    while (i < all.length - 1 && HONORIFICS.has(all[i]!)) i++;
    return all.slice(i);
}

/** The comparison form: normalised, honorific-free. */
function comparable(name: string): string {
    return payeeTokens(name).join(" ");
}

/**
 * Tunable knobs, so a threshold can be *measured* on real data rather than argued about.
 *
 * `src/scripts/check-payees.ts --sweep` runs the whole account through several settings and
 * prints what each one merges. That is the only way to choose these honestly: every value in
 * this file was picked by looking at what it did to 174 real spellings, not from a paper.
 */
export interface MatchOptions {
    /** Jaro-Winkler floor for two tokens to be the same word. */
    tokenThreshold?: number;
    /** Allow Double Metaphone agreement as an additional route between two real words. */
    phonetic?: boolean;
}

/**
 * Do two tokens refer to the same word?
 *
 * Four routes, in increasing order of how much they assume: equality, an abbreviation
 * (`M` for `Monda` — the commonest real variant), a near-miss that is almost certainly a typo,
 * and finally sounding the same.
 *
 * **The phonetic route is gated to real words on both sides.** Double Metaphone reduces short
 * strings to degenerate codes — a one-letter initial collapses onto a whole family of names —
 * so letting it near an initial would hand the most permissive comparison the most permissive
 * input. Abbreviations stay the prefix rule's job, where the initial-expansion counter can see
 * them.
 */
function sameToken(a: string, b: string, opts: Required<MatchOptions>): boolean {
    if (a === b) return true;
    if (a.startsWith(b) || b.startsWith(a)) return true;
    if (jaroWinkler(a, b) >= opts.tokenThreshold) return true;
    if (!opts.phonetic) return false;
    if (a.length < ANCHOR_MIN_LENGTH || b.length < ANCHOR_MIN_LENGTH) return false;
    return soundsAlike(a, b);
}

const isInitial = (t: string) => t.length <= INITIAL_MAX_LENGTH;

/**
 * Every word long enough to be worth recognising, across this user's payee names.
 *
 * Built per user and per run rather than shipped as a list, because the words that matter are
 * their counterparties' names. Longest first so segmentation is greedy toward whole words
 * instead of splitting `senapati` into two shorter vocabulary entries that happen to fit.
 */
export function buildVocabulary(names: string[]): string[] {
    const seen = new Set<string>();
    for (const name of names) {
        for (const t of payeeTokens(name)) if (t.length >= MIN_NAME_LENGTH) seen.add(t);
    }
    return [...seen].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/**
 * Split a run-together name back into words, using the vocabulary above.
 *
 * `SENAPATID` and `RUNUSENAPATI` are the same names as `SENAPATI D` and `RUNU SENAPATI` with
 * the space eaten by the narration, and until they are segmented they are a single opaque
 * token that no per-token rule can reach. Comparing them by whole-string similarity instead is
 * what the old code did, and it is why the concatenated forms only merged with their *exact*
 * counterpart and not with the rest of the person's spellings.
 *
 * The last part may be a **prefix** of a known word (`senapat` for `senapati`), which is how
 * truncated narrations come through, or a one-or-two-character initial.
 *
 * Returns `null` when the string cannot be consumed entirely — a partial split is a guess, and
 * a guess here invents a token that could anchor a wrong merge.
 */
function splitWithVocabulary(s: string, vocab: string[]): string[] | null {
    if (s.length === 0) return [];
    if (isInitial(s)) return [s];

    for (const word of vocab) {
        if (word.length > s.length || !s.startsWith(word)) continue;
        const rest = splitWithVocabulary(s.slice(word.length), vocab);
        if (rest) return [word, ...rest];
    }

    // A trailing fragment of a word we know: `senapat` → `senapati`.
    if (s.length >= MIN_NAME_LENGTH && vocab.some((w) => w.startsWith(s))) return [s];
    return null;
}

/**
 * A payee's tokens, with a concatenated name split back into words.
 *
 * Only single-token names are segmented — anything already spaced is taken as written. A
 * result is accepted only if it found at least two parts and at least one real word among
 * them, so a short name is never shredded into fragments that happen to be in the vocabulary.
 */
export function segmentName(name: string, vocab: string[]): string[] {
    const toks = payeeTokens(name);
    if (toks.length !== 1) return toks;

    const single = toks[0]!;
    if (single.length < MIN_SEGMENTABLE_LENGTH) return toks;

    // A glued-on honorific (`mrdriptasenapat`) blocks the split at character zero.
    for (const h of HONORIFICS) {
        if (!single.startsWith(h)) continue;
        const rest = single.slice(h.length);
        if (rest.length < MIN_SEGMENTABLE_LENGTH) continue;
        const split = splitWithVocabulary(rest, vocab);
        if (split && split.length >= 2) return split;
    }

    const split = splitWithVocabulary(single, vocab);
    if (!split || split.length < 2) return toks;
    if (!split.some((p) => p.length >= ANCHOR_MIN_LENGTH)) return toks;
    return split;
}

/**
 * Do these two token sets describe the same person, **in any order**?
 *
 * Order-independent, which is the change that made `SENAPATI D` and `DRIPTA SENAPATI` reachable
 * at all: Indian bank narrations write the surname first about as often as last, and a
 * positional comparison calls that two different people.
 *
 * Dropping position removes a guard, so three replace it:
 *
 *  - **An anchor is required** — at least one matched pair of *real words* (≥4 characters)
 *    that are equal or near-identical. This is what carries the claim. Without it, `S D` would
 *    match anyone whose initials happened to line up.
 *  - **At most one initial expansion.** Letting `D` stand for `Dripta` is necessary and it is
 *    also the most permissive rule here, because a single letter matches a whole family of
 *    names. One is a defensible abbreviation; two is a guess.
 *  - **Every real word on _both_ sides must be matched**, not just the shorter name's. This is
 *    the rule that separates people who share a name part, and leaving it out produced three
 *    confidently wrong merges on real data: `Abhishekdas` onto `Mukherjees Abhishek`,
 *    `Shivendra Kumar` onto `Basanta Kumar S`, and `Sena` onto `Ms Titas Senapa`. Each anchored
 *    on one genuinely shared word — a first name, `Kumar`, a truncation — while the *other*
 *    side carried a surname saying plainly that these were different people. Covering only the
 *    shorter name means the longer name's evidence is never read.
 *
 * Unmatched **initials** on either side are allowed, and only initials: a trailing `T` from a
 * clipped narration is debris, whereas a trailing `Mukherjees` is a person. The cost is that
 * genuine channel noise (`… UPI`, `… OKICICI`) now blocks a merge rather than being ignored —
 * accepted, because no such case exists in the data and the alternative demonstrably merges
 * strangers.
 *
 * Note this still rejects `RUNU SENAPATI` against `RUMA SENAPATI` — they anchor on `senapati`,
 * but `runu`/`ruma` is neither an initial nor within the token floor (0.73), so the shorter
 * name has an unmatched token and the whole alignment fails.
 */
export function tokensAlign(a: string[], b: string[], opts?: MatchOptions): boolean {
    const o = { tokenThreshold: TOKEN_THRESHOLD, phonetic: PHONETIC_DEFAULT, ...opts };
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (short.length === 0) return false;

    const taken = new Array<boolean>(long.length).fill(false);
    let initialExpansions = 0;
    let anchored = false;

    // Longest first: the substantial words claim their partners before an initial gets to,
    // so `d` cannot consume `dripta` and leave `senapati` unmatched.
    const order = [...short].sort((x, y) => y.length - x.length);

    for (const token of order) {
        let best = -1;
        let bestScore = -1;
        for (let i = 0; i < long.length; i++) {
            if (taken[i] || !sameToken(token, long[i]!, o)) continue;
            const score = token === long[i] ? 2 : jaroWinkler(token, long[i]!);
            if (score > bestScore) {
                bestScore = score;
                best = i;
            }
        }
        if (best === -1) return false;

        const partner = long[best]!;
        taken[best] = true;

        if (isInitial(token) || isInitial(partner)) {
            if (token !== partner) initialExpansions++;
        } else if (
            token.length >= ANCHOR_MIN_LENGTH &&
            partner.length >= ANCHOR_MIN_LENGTH &&
            (token === partner ||
                jaroWinkler(token, partner) >= ANCHOR_THRESHOLD ||
                (o.phonetic && soundsAlike(token, partner)))
        ) {
            anchored = true;
        }
    }

    // The longer name's evidence, which covering only the shorter name never reads.
    const unmatchedWord = long.some((t, i) => !taken[i] && !isInitial(t));
    if (unmatchedWord) return false;

    return anchored && initialExpansions <= 1;
}

/**
 * A comparator bound to one user's vocabulary.
 *
 * A factory rather than a bare function because segmentation needs to know which words exist
 * in *this* account — `senapatid` can only be split by someone who has seen `senapati`.
 */
export function createPayeeMatcher(
    names: string[],
    opts?: MatchOptions
): (a: string, b: string) => boolean {
    const vocab = buildVocabulary(names);
    const cache = new Map<string, string[]>();
    const seg = (name: string) => {
        let t = cache.get(name);
        if (!t) {
            t = segmentName(name, vocab);
            cache.set(name, t);
        }
        return t;
    };

    return (a, b) => {
        const na = comparable(a);
        const nb = comparable(b);
        if (na.length < MIN_NAME_LENGTH || nb.length < MIN_NAME_LENGTH) return false;
        if (na === nb) return true;
        return tokensAlign(seg(a), seg(b), opts);
    };
}

interface Variant {
    name: string;
    /** Transactions carrying this spelling — decides which variant wins. */
    weight: number;
    clusterIds: string[];
}

/**
 * Group variants into people, most-supported name first.
 *
 * **Greedy against a seed, not single-link clustering**, and the difference is
 * the whole reason this is written out rather than being a one-line reduce.
 * Single-link chains: if A merges with B and B with C, A and C end up together
 * even when they are nothing alike, and one intermediate spelling can collapse
 * two real people into one. Comparing every candidate against the *seed* — the
 * spelling with the most transactions behind it — keeps every member within one
 * hop of a name that demonstrably exists in the data.
 */
export function groupPayees(
    variants: Variant[],
    opts?: MatchOptions
): { canonical: string; members: Variant[] }[] {
    const isSame = createPayeeMatcher(variants.map((v) => v.name), opts);

    const pending = [...variants].sort(
        (x, y) => y.weight - x.weight || y.name.length - x.name.length || x.name.localeCompare(y.name)
    );

    const groups: { canonical: string; members: Variant[] }[] = [];
    while (pending.length > 0) {
        const seed = pending.shift()!;
        const members = [seed];
        for (let i = pending.length - 1; i >= 0; i--) {
            if (!isSame(seed.name, pending[i]!.name)) continue;
            members.push(pending.splice(i, 1)[0]!);
        }
        /**
         * The seed is the most-supported spelling, but not necessarily the most
         * *complete* one — `SENAPATI D` can outnumber `SENAPATI DAS`. Prefer the
         * longer spelling among the members, which is the one carrying the extra
         * information, with the weight ordering as the tie-break.
         *
         * Length is measured on the **honorific-free** form, or `Mr Dripta Senap`
         * beats `Dripta Senapati` on a tie by carrying a title rather than by
         * carrying more of the name. The stored value keeps whatever spelling it
         * had; only the ranking ignores the title.
         */
        const canonical = [...members].sort(
            (x, y) =>
                comparable(y.name).length - comparable(x.name).length ||
                y.weight - x.weight ||
                x.name.localeCompare(y.name)
        )[0]!.name;
        groups.push({ canonical, members });
    }
    return groups;
}

const payeeCanonicalizerTool = tool(async (input) => {
    const { userId } = input as { userId?: string };
    if (!userId) {
        console.warn("[Payees] no userId — skipping canonicalisation.");
        return "Payee canonicalisation skipped: no userId.";
    }

    const clusters = await prisma.cluster.findMany({
        where: { userId, payeeName: { not: null } },
        select: { id: true, payeeName: true, clusterLength: true },
    });

    // Collapse to distinct spellings first: the comparison is O(n²) in *names*,
    // and a year of statements has far more clusters than it has payees.
    const byName = new Map<string, Variant>();
    for (const c of clusters) {
        const name = c.payeeName?.trim();
        if (!name) continue;
        const existing = byName.get(name);
        if (existing) {
            existing.weight += c.clusterLength ?? 1;
            existing.clusterIds.push(c.id);
        } else {
            byName.set(name, { name, weight: c.clusterLength ?? 1, clusterIds: [c.id] });
        }
    }

    if (byName.size === 0) return "Payee canonicalisation: no payees to reconcile.";

    const groups = groupPayees([...byName.values()]);
    const merged = groups.filter((g) => g.members.length > 1);

    let rewritten = 0;
    for (const group of merged) {
        const stale = group.members.filter((m) => m.name !== group.canonical);
        const ids = stale.flatMap((m) => m.clusterIds);
        if (ids.length === 0) continue;
        // Scoped by userId as well as id: every write in this project filters on
        // the owner, so a wrong id cannot reach another tenant's row.
        const { count } = await prisma.cluster.updateMany({
            where: { id: { in: ids }, userId },
            data: { payeeName: group.canonical },
        });
        rewritten += count;

        /**
         * Record the merge before the evidence for it disappears.
         *
         * The `updateMany` above is destructive: after it, no cluster carries the old spelling
         * and nothing in the database says this name was ever two names. The UI needs that to
         * show the reader what was folded together, and an upsert keyed on the alias makes a
         * re-run idempotent — a spelling can only have been folded into one canonical.
         */
        await Promise.all(
            stale.map((m) =>
                prisma.payeeAlias.upsert({
                    where: { userId_alias: { userId, alias: m.name } },
                    create: { userId, canonical: group.canonical, alias: m.name, txnCount: m.weight },
                    update: { canonical: group.canonical, txnCount: m.weight },
                })
            )
        );

        /**
         * A canonical that is itself an alias of something else would strand the popup one hop
         * from the truth, so earlier rows are re-pointed at the new survivor. Rare — it needs a
         * spelling to arrive later that outranks the previous winner — but the alternative is a
         * chip that names a payee the app no longer shows anywhere.
         */
        await prisma.payeeAlias.updateMany({
            where: { userId, canonical: { in: stale.map((m) => m.name) } },
            data: { canonical: group.canonical },
        });

        console.log(
            `[Payees] ${group.canonical} ← ${stale.map((m) => m.name).join(", ")} (${count} cluster(s))`
        );
    }

    /**
     * Retire `RecurringPattern` rows still keyed on a spelling that no longer exists.
     *
     * **Rewriting `Cluster.payeeName` is not enough, and the gap silently double-counts
     * income.** `RecurringPattern` denormalises the payee name and is unique on
     * `[userId, merchantName, payeeName, estimatedMonthlyAmount, type]`, so when
     * `recurringPatternTool` re-derives patterns from the now-canonical clusters it writes a
     * *new* row rather than updating the old one — and the old one stays `isActive`, because
     * the deactivation sweep only retires patterns whose transactions stopped arriving. They
     * didn't; they started arriving under a different name. On real data this left
     * `Senapati D` and `Dripta Senapati` both holding an active ₹70,500 monthly credit, and
     * `getRecurringSummary` counted both toward the income floor.
     *
     * **Driven by the whole `PayeeAlias` table, not by what merged in this run.** A per-merge
     * delete would only ever fix accounts that merge *after* this code shipped, and would leave
     * every account that merged before it permanently double-counted — the merge is idempotent,
     * so there is no later run in which it becomes "this run's" merge again. Reconciling against
     * the recorded aliases makes the repair self-healing instead.
     *
     * Deleted rather than renamed, because renaming collides with the row that already exists
     * under the canonical name — that collision *is* the bug. `recurringPatternToolNode` runs
     * immediately after this one and re-derives what it needs, so this cannot leave a hole.
     */
    const known = await prisma.payeeAlias.findMany({ where: { userId }, select: { alias: true } });
    if (known.length > 0) {
        const { count } = await prisma.recurringPattern.deleteMany({
            where: { userId, payeeName: { in: known.map((a) => a.alias) } },
        });
        if (count > 0) console.log(`[Payees] dropped ${count} recurring pattern(s) under a merged-away name.`);
    }

    const summary = `Payee canonicalisation: ${byName.size} spelling(s) → ${groups.length} payee(s), ${rewritten} cluster(s) rewritten.`;
    console.log(`[Payees] ${summary}`);
    return summary;
}, {
    name: "payeeCanonicalizerTool",
    description:
        "Merges Jaro-Winkler-similar spellings of the same payee onto one canonical name. Payee names only — never merchant names.",
    schema: z.object({
        userId: z.string().optional().describe("Owner whose payee names are being reconciled"),
    }),
});

export { payeeCanonicalizerTool, TOKEN_THRESHOLD, ANCHOR_THRESHOLD };
