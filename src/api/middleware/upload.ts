import multer from "multer";

/**
 * Both multer instances use memory storage — the buffer is handed straight to
 * `storage.put()` (`src/lib/storage.ts`), which writes it to local disk or S3
 * depending on `STORAGE_DRIVER`. Nothing here knows or cares which.
 */
export const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
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

/**
 * Extension is derived from the sniffed mimetype, never from the uploaded
 * filename. A name is attacker-controlled: taking `.jpg` off it would let
 * someone store `../../index.js`, and even after sanitising it lets the
 * stored extension disagree with the bytes.
 */
export const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

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
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!AVATAR_MIME_EXTENSIONS[file.mimetype]) {
            cb(new Error("INVALID_FILE_TYPE: Only JPEG, PNG or WebP images are accepted"));
            return;
        }
        cb(null, true);
    },
}).single("avatar");
