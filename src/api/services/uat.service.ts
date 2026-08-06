import { UAT_ENABLED, UAT_TEST_PASSWORD, UAT_TEST_PDFS, UAT_TESTERS } from "../../config/uat.js";
import { storage } from "../../lib/storage.js";
import { NotFoundError } from "../errors.js";
import { PLANS } from "../../config/plans.js";

export function getConfig() {
    return { enabled: UAT_ENABLED };
}

export function listTestPdfs() {
    if (!UAT_ENABLED) throw new NotFoundError("UAT test PDFs");
    return UAT_TEST_PDFS.map(({ id, label, passwordProtected }) => ({ id, label, passwordProtected }));
}

export async function downloadTestPdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    if (!UAT_ENABLED) throw new NotFoundError("UAT test PDF", id);
    const pdf = UAT_TEST_PDFS.find((p) => p.id === id);
    if (!pdf) throw new NotFoundError("UAT test PDF", id);
    const buffer = await storage.getBuffer(storage.keyFor("uat", pdf.filename));
    return { buffer, filename: pdf.filename };
}

export function listTesters() {
    if (!UAT_ENABLED) throw new NotFoundError("UAT testers");
    return UAT_TESTERS.map((t) => ({
        email: t.email,
        plan: t.plan,
        planLabel: PLANS[t.plan]?.name ?? t.plan,
        password: UAT_TEST_PASSWORD,
    }));
}
