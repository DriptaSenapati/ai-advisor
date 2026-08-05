import { randomUUID } from "crypto";
import prisma from "../../prismaClient.js";
import { NotFoundError } from "../errors.js";
import { storage } from "../../lib/storage.js";
import { AVATAR_MIME_EXTENSIONS } from "../middleware/upload.js";
import { planIdFor } from "../middleware/entitlement.js";
import { resolvePlan } from "../../config/plans.js";

/**
 * Profile picture storage.
 *
 * `User.image` holds an **absolute URL**, which is the shape better-auth already
 * writes there when someone signs in with Google. Keeping ours the same means
 * the client renders both sources through one code path and never has to ask
 * where a picture came from. `storage.publicUrl()` produces that URL — the API's
 * own origin + `/avatars/<file>` on local disk, the bucket's own domain on S3 —
 * and this module never needs to know which.
 */

/**
 * Extract the storage key from a URL this API generated, or `null` if it is not
 * one of ours (a Google URL, most likely). Rebuilding the expected URL from the
 * candidate key and comparing is what makes this driver-agnostic: a local URL's
 * origin is this API's own, an S3 URL's is the bucket's, and only
 * `storage.publicUrl()` knows which is currently active.
 */
function avatarKeyFromUrl(image: string | null): string | null {
    if (!image) return null;

    let pathname: string;
    try {
        pathname = new URL(image).pathname;
    } catch {
        return null;
    }

    const filename = pathname.split("/").pop() ?? "";
    if (!/^[\w-]+\.(jpg|png|webp)$/.test(filename)) return null;

    const key = storage.keyFor("avatars", filename);
    return storage.publicUrl(key) === image ? key : null;
}

/**
 * Delete a previously stored avatar, if the URL is one of ours.
 *
 * A failure here is logged and swallowed: the user asked to change their
 * picture, and refusing to do so because an old file could not be removed would
 * turn a housekeeping problem into a broken feature. The worst case is one
 * orphaned file.
 */
async function removeStoredAvatar(image: string | null): Promise<void> {
    const key = avatarKeyFromUrl(image);
    if (!key) return;

    try {
        await storage.delete(key);
    } catch (err) {
        console.error(`[Users] could not remove old avatar ${key}:`, err);
    }
}

async function requireUser(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, image: true } });
    if (!user) throw new NotFoundError("User", userId);
    return user;
}

/** Store a freshly uploaded file as this user's picture, replacing any previous one. */
export async function setAvatar(userId: string, buffer: Buffer, mimetype: string) {
    const existing = await requireUser(userId);

    // multer's fileFilter has already rejected anything not in this map.
    const ext = AVATAR_MIME_EXTENSIONS[mimetype] ?? "bin";
    const key = storage.keyFor("avatars", `${randomUUID()}.${ext}`);
    await storage.put(key, buffer, mimetype);
    const image = storage.publicUrl(key);

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
