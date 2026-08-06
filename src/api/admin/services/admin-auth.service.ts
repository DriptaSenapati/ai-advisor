import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

/**
 * The admin panel's credential, entirely separate from better-auth and the
 * `User` model — a single hardcoded account (`ADMIN_USERNAME` +
 * `ADMIN_PASSWORD_HASH`, both dev-only env vars), never seeded into Mongo.
 */

const ADMIN_JWT_ALG = "HS256";
const ADMIN_SESSION_TTL = "8h";

function secretKey(): Uint8Array {
    const secret = process.env["ADMIN_JWT_SECRET"];
    if (!secret) throw new Error("ADMIN_JWT_SECRET is not set");
    return new TextEncoder().encode(secret);
}

/**
 * Never reveal which half was wrong — same judgment call the product's own
 * auth screens make for credential failures.
 */
export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
    const expectedUsername = process.env["ADMIN_USERNAME"];
    const expectedHash = process.env["ADMIN_PASSWORD_HASH"];
    if (!expectedUsername || !expectedHash) return false;
    if (username !== expectedUsername) return false;
    return bcrypt.compare(password, expectedHash);
}

export async function signAdminToken(username: string): Promise<string> {
    return new SignJWT({ username })
        .setProtectedHeader({ alg: ADMIN_JWT_ALG })
        .setSubject("admin")
        .setIssuedAt()
        .setExpirationTime(ADMIN_SESSION_TTL)
        .sign(secretKey());
}

export interface AdminTokenClaims {
    username: string;
}

/** Throws on an invalid/expired/tampered token — callers treat any throw as unauthenticated. */
export async function verifyAdminToken(token: string): Promise<AdminTokenClaims> {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ADMIN_JWT_ALG] });
    return { username: payload["username"] as string };
}

/** Matches the maxAge below — kept in one place so the cookie and the token can't drift apart. */
export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
