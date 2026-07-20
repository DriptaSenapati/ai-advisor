import "./envConfig.js";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prismaClient.js";

if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
}

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "mongodb" }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3001}`,
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 10,
    },
    trustedOrigins: [
        process.env.FRONTEND_URL ?? "http://localhost:3000",
    ],
    session: {
        expiresIn: 60 * 60 * 24 * 7,        // 7 days
        updateAge: 60 * 60 * 24,             // refresh session if older than 24h
    },
    plugins: [
        bearer(),   // enables Authorization: Bearer <token> for API clients
    ],
});

export type Auth = typeof auth;
