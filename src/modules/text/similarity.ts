import { doubleMetaphone } from "double-metaphone";

/**
 * String similarity for reconciling names the pipeline read from free text.
 *
 * Kept general and dependency-free. The one consumer today is payee
 * canonicalisation (`payee_canonicalizer_tool.ts`); anything else that needs to
 * decide whether two human-entered strings are the same thing should come here
 * rather than growing a second implementation.
 */

/**
 * Jaro similarity — 0 (nothing in common) to 1 (identical).
 *
 * Counts characters that appear in both strings within a window of
 * `floor(max(|a|,|b|) / 2) - 1`, then penalises the ones that matched out of
 * order (transpositions). It is designed for short human strings where the
 * errors are typos and dropped letters, which is exactly what a bank narration
 * does to a person's name.
 */
export function jaro(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
    const aMatched = new Array<boolean>(a.length).fill(false);
    const bMatched = new Array<boolean>(b.length).fill(false);

    let matches = 0;
    for (let i = 0; i < a.length; i++) {
        const start = Math.max(0, i - window);
        const end = Math.min(i + window + 1, b.length);
        for (let j = start; j < end; j++) {
            if (bMatched[j] || a[i] !== b[j]) continue;
            aMatched[i] = true;
            bMatched[j] = true;
            matches++;
            break;
        }
    }
    if (matches === 0) return 0;

    // Transpositions: matched characters that appear in a different order.
    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < a.length; i++) {
        if (!aMatched[i]) continue;
        while (!bMatched[k]) k++;
        if (a[i] !== b[k]) transpositions++;
        k++;
    }
    transpositions /= 2;

    return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

/** Longest common prefix, capped — Winkler's boost only ever considers four. */
function commonPrefix(a: string, b: string, max = 4): number {
    const limit = Math.min(max, a.length, b.length);
    let n = 0;
    while (n < limit && a[n] === b[n]) n++;
    return n;
}

/**
 * Jaro-Winkler: Jaro, with a bonus for agreeing on the first few characters.
 *
 * **The prefix bonus is the reason this is the right tool here and also its one
 * sharp edge.** Bank narrations truncate and abbreviate the *end* of a name far
 * more often than the start ("MAHADWIP MONDA" → "MAHADWIP M"), which is what
 * Winkler's boost is built for. The same boost is why "RUNU SENAPATI" and "RUMA
 * SENAPATI" — two different people — score high, and why the caller must pair a
 * strict threshold with the guards in `payee_canonicalizer_tool.ts` rather than
 * trusting this number alone.
 *
 * `scaling` is Winkler's 0.1 constant; above 0.25 the bonus can push the result
 * past 1, which is why the standard fixes it there.
 */
export function jaroWinkler(a: string, b: string, scaling = 0.1): number {
    const base = jaro(a, b);
    if (base === 0) return 0;
    return base + commonPrefix(a, b) * scaling * (1 - base);
}

/**
 * Fold a name to the form similarity is measured on.
 *
 * Case, punctuation and repeated spaces are noise from the narration, not
 * signal about who was paid. Digits are stripped too: reference numbers ride
 * along in some formats ("JOHN DOE 4471") and would otherwise make two
 * sightings of one person look like two people.
 */
export function normaliseName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** The set of whitespace-separated words in a normalised name. */
export function tokens(name: string): string[] {
    const n = normaliseName(name);
    return n.length === 0 ? [] : n.split(" ");
}

/**
 * Do two words plausibly *sound* the same?
 *
 * Double Metaphone reduces a word to one or two pronunciation codes and answers a question
 * edit distance cannot: `Ghosh`/`Ghose` and `Mukherjee`/`Mukherji` differ in spelling but not
 * in sound, and transliterated Indian surnames vary in exactly the places English orthography
 * is ambiguous — aspirated consonants (`th`/`t`, `dh`/`d`, `gh`/`g`), `v`/`w`, `s`/`sh`/`z`.
 * Two codes are returned per word precisely so an ambiguous pronunciation can match either
 * reading; a hit on *either* is a match.
 *
 * **Its reach here is narrower than the literature suggests**, and that is worth knowing before
 * relying on it: the rules encode *English* phonology, so it handles `Senapati`/`Senapathi`
 * well and is no help at all on `Banerjee`/`Bandopadhyay`, which are the same family name by
 * convention rather than by sound. It is a supplement to string similarity, never a
 * replacement — it is far more permissive, collapsing whole families of spellings onto one
 * code, so callers must gate it on token length and keep their structural guards.
 */
export function soundsAlike(a: string, b: string): boolean {
    if (a === b) return true;
    const [a1, a2] = doubleMetaphone(a);
    const [b1, b2] = doubleMetaphone(b);
    if (!a1 || !b1) return false;
    return a1 === b1 || a1 === b2 || a2 === b1 || (!!a2 && a2 === b2);
}
