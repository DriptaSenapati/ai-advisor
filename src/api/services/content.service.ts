import prisma from "../../prismaClient.js";
import { SITE_CONTENT_KEYS, type SiteContentKey } from "../../config/site-content.js";

/**
 * Single Prisma access point for `SiteContent` — both the public read
 * (`GET /content`) and the admin CRUD (`GET/PUT /admin/content`) call into
 * this, so there is exactly one place that knows the collection's shape.
 */

/** `{ [key]: value }` for every row that exists. Missing keys are omitted —
 *  callers render their own hardcoded default for those, never a blank. */
export async function getPublicContent(): Promise<Record<string, string>> {
    const rows = await prisma.siteContent.findMany({ select: { key: true, value: true } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Every row, plus every key in the fixed vocabulary with `value: null` when
 *  unset — so the admin form always renders a field for each editable string. */
export async function listContentForAdmin(): Promise<{ key: SiteContentKey; value: string | null; updatedAt: Date | null; updatedBy: string | null }[]> {
    const rows = await prisma.siteContent.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return SITE_CONTENT_KEYS.map((key) => {
        const row = byKey.get(key);
        return { key, value: row?.value ?? null, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
    });
}

export async function upsertContent(entries: { key: SiteContentKey; value: string }[], updatedBy: string): Promise<void> {
    await Promise.all(
        entries.map((e) =>
            prisma.siteContent.upsert({
                where: { key: e.key },
                create: { key: e.key, value: e.value, updatedBy },
                update: { value: e.value, updatedBy },
            })
        )
    );
}
