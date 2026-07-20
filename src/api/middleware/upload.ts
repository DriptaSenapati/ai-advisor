import multer from "multer";
import { randomUUID } from "crypto";
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
