import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * The one thing every uploaded file (statement PDFs, avatars) goes through, so
 * `STORAGE_DRIVER=local|s3` is the only thing that changes between dev and prod
 * — nothing above this module knows or cares which one is active.
 */
export interface FileStorage {
    put(key: string, buffer: Buffer, contentType: string): Promise<void>;
    getBuffer(key: string): Promise<Buffer>;
    /** A real local path the caller can hand to mupdf. Always pair with `releaseTempFile`. */
    downloadToTempFile(key: string): Promise<string>;
    releaseTempFile(tempPath: string): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    /** Only meaningful for `"avatars"` keys — statements are never public. */
    publicUrl(key: string): string;
    /** Builds a fresh, driver-appropriate key for a new upload of the given kind. */
    keyFor(kind: "statements" | "avatars", filename: string): string;
}

function publicOrigin(): string {
    return (process.env["BETTER_AUTH_URL"] || `http://localhost:${process.env["PORT"] || 3001}`).replace(/\/+$/, "");
}

/**
 * `key` is used exactly as a filesystem path — relative to `process.cwd()` or
 * absolute — the same contract a bare `fs.readFileSync(path)` already had here.
 * That is deliberate: it is what keeps the CLI/dev entry point (`src/index.ts`,
 * `statementPath: "assets/hdfc.pdf"`) working unchanged even though it never
 * goes through `keyFor` and knows nothing about the `uploads/` layout.
 */
class LocalFileStorage implements FileStorage {
    async put(key: string, buffer: Buffer): Promise<void> {
        await fsp.mkdir(path.dirname(key), { recursive: true });
        await fsp.writeFile(key, buffer);
    }

    async getBuffer(key: string): Promise<Buffer> {
        return fsp.readFile(key);
    }

    async downloadToTempFile(key: string): Promise<string> {
        // Already a real, readable local path — no copy needed.
        return key;
    }

    async releaseTempFile(): Promise<void> {
        // No-op. The "temp" path returned above IS the canonical file; deleting
        // it here would destroy the only copy. Real cleanup goes through delete().
    }

    async delete(key: string): Promise<void> {
        await fsp.rm(key, { force: true });
    }

    async exists(key: string): Promise<boolean> {
        try {
            await fsp.access(key);
            return true;
        } catch {
            return false;
        }
    }

    publicUrl(key: string): string {
        // Only ever called for avatar keys. app.ts mounts express.static at
        // "/avatars" serving uploads/avatars/ directly, so the URL is the
        // origin plus the bare filename regardless of the key's own prefix.
        return `${publicOrigin()}/avatars/${path.basename(key)}`;
    }

    keyFor(kind: "statements" | "avatars", filename: string): string {
        return path.join(process.cwd(), "uploads", kind, filename);
    }
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required when STORAGE_DRIVER=s3`);
    return value;
}

class S3FileStorage implements FileStorage {
    private readonly client: S3Client;
    private readonly bucket: string;

    constructor() {
        this.bucket = requireEnv("AWS_S3_BUCKET");
        this.client = new S3Client({
            region: requireEnv("AWS_REGION"),
            credentials: {
                accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
                secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
            },
        });
    }

    async put(key: string, buffer: Buffer, contentType: string): Promise<void> {
        await this.client.send(
            new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType })
        );
    }

    async getBuffer(key: string): Promise<Buffer> {
        const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        const bytes = await res.Body!.transformToByteArray();
        return Buffer.from(bytes);
    }

    async downloadToTempFile(key: string): Promise<string> {
        const buffer = await this.getBuffer(key);
        const tempPath = path.join(fs.realpathSync(os.tmpdir()), `${randomUUID()}-${path.basename(key)}`);
        await fsp.writeFile(tempPath, buffer);
        return tempPath;
    }

    async releaseTempFile(tempPath: string): Promise<void> {
        await fsp.rm(tempPath, { force: true }).catch(() => {});
    }

    async delete(key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }

    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
            return true;
        } catch {
            return false;
        }
    }

    publicUrl(key: string): string {
        return `https://${this.bucket}.s3.${process.env["AWS_REGION"]}.amazonaws.com/${key}`;
    }

    keyFor(kind: "statements" | "avatars", filename: string): string {
        return `${kind}/${filename}`;
    }
}

export const storage: FileStorage =
    process.env["STORAGE_DRIVER"] === "s3" ? new S3FileStorage() : new LocalFileStorage();
