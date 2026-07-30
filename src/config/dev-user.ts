/**
 * The owner assigned to data created by the CLI and the dev scripts.
 *
 * Every model the pipelines write — `FinalTransactionData`, `Cluster`,
 * `MonthlyStats`, `RecurringPattern`, `InsightReport` — now requires a `userId`.
 * The API paths get a real one from the session; `src/index.ts`,
 * `checkpoint-runner` and the other runners have no session at all, so they need
 * something.
 *
 * A constant rather than `undefined` or an empty string, deliberately. Those
 * would recreate the exact failure this scoping work exists to fix: rows with no
 * owner that no user-scoped query can ever see again, written silently. A named
 * sentinel is visible in the database, greppable, and trivially deletable —
 * `wipe:app-data` and `clean:verify` both remove it along with everything else.
 *
 * Override with `DEV_USER_ID` to point a local pipeline run at a real account,
 * which is how you make CLI-generated data show up in the dashboard.
 */
export const DEV_USER_ID = process.env.DEV_USER_ID || "cli-dev-user";
