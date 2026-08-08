/**
 * The account number has no use in this app beyond display ("ending in
 * 1234") — nothing matches, dedupes, or looks up against it (`contentHash`
 * already owns dedup). So the full value is never persisted at all, rather
 * than being encrypted at rest: the strongest guarantee against leaking it is
 * to not have it.
 *
 * Mirrors the frontend's own `maskAccount()` (`ExtractionReceipt.tsx`) —
 * strip whitespace, take the last 4 characters — so a value already
 * truncated here is a no-op if re-sliced there.
 */
export function last4(accountNumber: string | null | undefined): string | null {
    if (!accountNumber) return null;
    const stripped = accountNumber.replace(/\s/g, "");
    return stripped.slice(-4) || null;
}
