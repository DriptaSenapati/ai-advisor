import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "../auth.js";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/authenticate.js";
import router from "./routes/index.js";
import { createBullBoard } from "@bull-board/api";
import { ExpressAdapter } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { pdfQueue, insightsQueue, goalQueue } from "../queue/index.js";

const app = express();

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
app.use(cors({
    origin: process.env.FRONTEND_URL ?? "*",
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
