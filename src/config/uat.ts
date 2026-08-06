/**
 * UAT testing switch. One flag, one place — every route and every UI decision
 * for the sample-PDF picker and the demo-account panel reads `UAT_ENABLED`
 * from here, so turning testing off is a single env var, not a code change.
 */

export const UAT_ENABLED = process.env["UAT_TESTING_FLAG"] === "true";

/** Shared by every seeded tester account and shown back to testers as-is. */
export const UAT_TEST_PASSWORD = process.env["UAT_TEST_PASSWORD"] ?? "";

export interface UatTester {
    email: string;
    plan: "first" | "glow" | "radiant";
    label: string;
}

export const UAT_TESTERS: UatTester[] = [
    { email: "uat.first@illuminate.test", plan: "first", label: "First light (free)" },
    { email: "uat.glow@illuminate.test", plan: "glow", label: "Glow" },
    { email: "uat.radiant@illuminate.test", plan: "radiant", label: "Radiant" },
];

export interface UatTestPdf {
    id: string;
    label: string;
    filename: string;
    passwordProtected: boolean;
    /** Shown in the picker so a tester can pick a statement long enough for the
     *  feature they want to try — the goal simulator needs 6+ months, for one. */
    months: number;
}

export const UAT_TEST_PDFS: UatTestPdf[] = [
    { id: "salaried-savings", label: "Salaried — savings account", filename: "uat-salaried-savings.pdf", passwordProtected: false, months: 7 },
    { id: "freelancer-mixed", label: "Freelancer — variable income", filename: "uat-freelancer-mixed.pdf", passwordProtected: false, months: 7 },
    { id: "family-joint", label: "Family — joint account (locked)", filename: "uat-family-joint.pdf", passwordProtected: true, months: 7 },
    { id: "small-business", label: "Small business owner (locked)", filename: "uat-small-business.pdf", passwordProtected: true, months: 7 },
    { id: "annual-overview", label: "Full year, high activity", filename: "uat-annual-overview.pdf", passwordProtected: false, months: 12 },
];
