import fs from "fs/promises";
import path from "path";
import prisma from "../../prismaClient.js";
import { NotFoundError } from "../errors.js";
import { AVATAR_DIR } from "../middleware/upload.js";
import { planIdFor } from "../middleware/entitlement.js";
import { resolvePlan } from "../../config/plans.js";

/**
 * Profile picture storage.
 *
 * `User.image` holds an **absolute URL**, which is the shape better-auth already
 * writes there when someone signs in with Google. Keeping ours the same means
 * the client renders both sources through one code path and never has to ask
 * where a picture came from.
 *
 * The cost of absolute URLs is that they embed this API's public origin, so
 * moving the API to a different host orphans previously-stored avatars (Google's
 * keep working — they point at Google). That is a deployment-time migration, not
 * a runtime concern, and it buys the single-code-path property above.
 */

const AVATAR_ROUTE = "/avatars";

/** The API's own public origin — the same value better-auth derives its base from. */
function publicOrigin(): string {
    return (process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, "");
}

export function avatarUrl(filename: string): string {
    return `${publicOrigin()}${AVATAR_ROUTE}/${filename}`;
}

/**
 * Delete a previously stored avatar file, if the URL is one of ours.
 *
 * **The origin check is the point.** `User.image` may hold a Google URL, and
 * this must never try to interpret that as a local path. The filename is also
 * re-derived with `path.basename` and required to look like a generated one, so
 * a value that somehow arrived with `../` in it resolves to a harmless leaf
 * rather than escaping `uploads/avatars`.
 *
 * A failure here is logged and swallowed: the user asked to change their
 * picture, and refusing to do so because an old file could not be removed would
 * turn a housekeeping problem into a broken feature. The worst case is one
 * orphaned file.
 */
async function removeStoredAvatar(image: string | null): Promise<void> {
    if (!image) return;
    if (!image.startsWith(`${publicOrigin()}${AVATAR_ROUTE}/`)) return;

    const filename = path.basename(new URL(image).pathname);
    if (!/^[\w-]+\.(jpg|png|webp|bin)$/.test(filename)) return;

    try {
        await fs.unlink(path.join(AVATAR_DIR, filename));
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") console.error(`[Users] could not remove old avatar ${filename}:`, err);
    }
}

async function requireUser(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, image: true } });
    if (!user) throw new NotFoundError("User", userId);
    return user;
}

/** Store a freshly uploaded file as this user's picture, replacing any previous one. */
export async function setAvatar(userId: string, filename: string) {
    const existing = await requireUser(userId);
    const image = avatarUrl(filename);

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { image },
        select: { id: true, name: true, email: true, image: true },
    });

    // After the write, not before: if the update fails the user keeps the
    // picture they had rather than losing it to a half-applied change.
    await removeStoredAvatar(existing.image);

    return updated;
}

/**
 * Clear the picture.
 *
 * Works for a Google-sourced image too — it just clears the field, leaving no
 * file to delete. Signing in with Google again re-populates it, which is the
 * behaviour people expect: this removes the picture, it does not opt out of
 * having one.
 */
export async function removeAvatar(userId: string) {
    const existing = await requireUser(userId);

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { image: null },
        select: { id: true, name: true, email: true, image: true },
    });

    await removeStoredAvatar(existing.image);
    return updated;
}

/**
 * `plan` is joined in rather than stored on `User`: the subscription is its own
 * model (better-auth owns this row — see the schema docblock), and a user who
 * has never had one set resolves to the free plan rather than `null`, so this
 * field is always a real plan id.
 */
export async function getProfile(userId: string) {
    const [user, planId] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, image: true, emailVerified: true, createdAt: true },
        }),
        planIdFor(userId),
    ]);
    if (!user) throw new NotFoundError("User", userId);
    return { ...user, plan: resolvePlan(planId).id };
}
