import "../envConfig.js";
import app from "./app.js";
import fs from "fs";
import path from "path";
import { bootstrapDatabase } from "../config/bootstrap-db.js";

const PORT = Number(process.env.PORT ?? 3001);

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * The database is brought in line with schema.prisma *before* the port opens,
 * not after. Binding first and syncing in the background would mean a window
 * where the server accepts uploads against collections whose indexes don't
 * exist yet — silently losing the contentHash dedup guarantee, among others.
 *
 * A failure here is fatal on purpose. An API that can't guarantee its own
 * schema should not answer requests; exiting nonzero lets the supervisor
 * (`concurrently --kill-others`, or Docker's `restart: unless-stopped`) do
 * something about it, whereas serving anyway just defers the damage.
 */
async function start() {
    try {
        await bootstrapDatabase();
    } catch (err) {
        console.error(`[API] database bootstrap failed — not starting.`);
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`[API] Server running on http://localhost:${PORT}`);
        console.log(`[API] Swagger docs at http://localhost:${PORT}/api/docs`);
        console.log(`[API] Environment: ${process.env.NODE_ENV ?? "development"}`);
    });
}

start();
