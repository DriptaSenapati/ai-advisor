import multer from "multer";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path.join(process.cwd(), "uploads"));
    },
    filename: (_req, _file, cb) => {
        cb(null, `${Date.now()}-${randomUUID()}.pdf`);
    },
});

export const uploadMiddleware = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== "application/pdf") {
            cb(new Error("INVALID_FILE_TYPE: Only PDF files are accepted"));
            return;
        }
        cb(null, true);
    },
}).single("file");

/* ---------------------------------- avatars ---------------------------------- */

export const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatars");

// multer's `destination` callback will not create a missing directory — it just
// fails the request. Created once at import, alongside the `uploads/` root the
// PDF path already assumes exists.
fs.mkdirSync(AVATAR_DIR, { recursive: true });

/**
 * Extension is derived from the sniffed mimetype, never from the uploaded
 * filename. A name is attacker-controlled: taking `.jpg` off it would let
 * someone store `../../index.js`, and even after `path.basename` it lets the
 * stored extension disagree with the bytes.
 */
const AVATAR_TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

const avatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}.${AVATAR_TYPES[file.mimetype] ?? "bin"}`),
});

/**
 * 2 MB, and no server-side resizing.
 *
 * Nothing in this project can resize an image — there is no `sharp` — so the
 * bytes that arrive are the bytes that get served, and the cap is the only thing
 * standing between a 40 MP phone photo and every page load that shows an avatar.
 * 2 MB is generous for a picture displayed at 36px and small enough not to hurt.
 * If avatars ever need to be larger, add a resize step rather than raising this.
 */
export const avatarUploadMiddleware = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!AVATAR_TYPES[file.mimetype]) {
            cb(new Error("INVALID_FILE_TYPE: Only JPEG, PNG or WebP images are accepted"));
            return;
        }
        cb(null, true);
    },
}).single("avatar");
