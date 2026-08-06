import path from "path";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "../auth.js";
import { WEB_ORIGINS } from "../config/origins.js";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/authenticate.js";
import router from "./routes/index.js";
import adminRouter from "./admin/routes/admin.routes.js";
import { createBullBoard } from "@bull-board/api";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { extractQueue, pdfQueue, insightsQueue, goalQueue } from "../queue/index.js";

const app = express();

/**
 * Trust exactly one hop of `X-Forwarded-For` — the reverse proxy/load balancer
 * every real deployment sits behind (nginx, a PaaS's edge, Cloudflare, ...).
 *
 * Without this, `express-rate-limit`@8 throws at request time the moment such a
 * proxy forwards that header: "The 'X-Forwarded-For' header is set but the
 * Express 'trust proxy' setting is false", which took every rate-limited route
 * down in front of any real proxy. It also makes `req.secure`/`req.ip` resolve
 * from the forwarded values instead of the proxy's own, which `helmet` and
 * better-auth's `Secure` cookie detection both depend on being correct.
 *
 * `1` means "trust the nearest proxy only" — right for a single load balancer
 * in front of the API. Raise it only if another hop is added between the
 * client and that first proxy.
 */
app.set("trust proxy", 1);

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:"],
                fontSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
            },
        },
    })
);
/**
 * Explicit allowlist — marketing origin + app origin. There is deliberately no
 * "*" fallback: a wildcard origin is rejected outright by browsers whenever
 * `credentials: true`, so the old fallback only looked like a safety net while
 * actually failing every credentialed request.
 */
app.use(cors({
    origin: WEB_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
        const ms = Date.now() - start;
        const s = res.statusCode;
        const c = s >= 500 ? "\x1b[31m" : s >= 400 ? "\x1b[33m" : s >= 300 ? "\x1b[36m" : "\x1b[32m";
        console.log(`${c}${req.method}\x1b[0m ${req.originalUrl} ${c}${s}\x1b[0m ${ms}ms`);
    });
    next();
});

// Better Auth — must be mounted before express.json() (handles its own body parsing)
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(globalLimiter);

/**
 * Profile pictures, served as static files.
 *
 * **Deliberately public, and mounted outside `/api/v1` so no auth runs.** An
 * `<img>` cannot send an `Authorization` header, and while the session cookie
 * would ride along same-site today, that stops being true the moment the app is
 * served from a different site than this API. Filenames are v4 UUIDs, so a URL
 * is unguessable — the same posture Google uses for the avatar URLs better-auth
 * already stores in this very field.
 *
 * `crossOriginResourcePolicy: "cross-origin"` is what actually makes them load.
 * Helmet sets `Cross-Origin-Resource-Policy: same-origin` globally, and the app
 * runs on a different origin from this API in every environment — localhost:3000
 * against localhost:3001 in dev, app.example.com against api.example.com in
 * production. Without this the browser fetches the bytes and then refuses to
 * render them, which looks exactly like a broken image URL.
 *
 * `dotfiles: "deny"` and `index: false` because this directory holds nothing but
 * generated files; there is no reason to serve a listing or anything hidden.
 */
app.use(
    "/avatars",
    express.static(path.join(process.cwd(), "uploads", "avatars"), {
        maxAge: "7d",
        immutable: true,   // a UUID filename is never reused, so the bytes never change
        dotfiles: "deny",
        index: false,
        setHeaders: (res) => res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
    })
);

/**
 * Mounted before the general `/api/v1` router, and deliberately so: this
 * router owns its own authentication (`requireAdminAuth`, a JWT cookie tied to
 * a single hardcoded admin account) rather than better-auth's `requireAuth`.
 * Its routes live in `./admin/`, a directory `swagger.ts`'s glob never scans,
 * so none of this appears in `/api/spec.json` or `/api/docs`.
 */
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1", router);

// Swagger docs
app.get("/api/spec.json", (_req, res) => { res.json(swaggerSpec); });
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(undefined, {
    customSiteTitle: "AI Financial Advisor API",
    swaggerOptions: {
        url: "/api/spec.json",
        persistAuthorization: true,
        withCredentials: true,
    },
}));

// Bull Board queue dashboard — gated by auth
const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath("/admin/queues");
createBullBoard({
    queues: [
        new BullMQAdapter(extractQueue),
        new BullMQAdapter(pdfQueue),
        new BullMQAdapter(insightsQueue),
        new BullMQAdapter(goalQueue),
    ],
    serverAdapter: boardAdapter,
});
function bullBoardAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (header?.startsWith("Basic ")) {
        const [user, pass] = Buffer.from(header.slice(6), "base64").toString().split(":");
        if (
            user === (process.env.BULL_BOARD_USER ?? "admin") &&
            pass === (process.env.BULL_BOARD_PASSWORD ?? "admin123")
        ) {
            return next();
        }
    }
    res.setHeader("WWW-Authenticate", 'Basic realm="Bull Board"');
    return res.status(401).send("Unauthorized");
}

app.use("/admin/queues", bullBoardAuth, boardAdapter.getRouter());

app.use(errorHandler);

export default app;
