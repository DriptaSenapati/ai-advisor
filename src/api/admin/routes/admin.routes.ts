import { Router } from "express";
import authRouter from "./auth.routes.js";
import usersRouter from "./users.routes.js";
import statementsRouter from "./statements.routes.js";
import jobsRouter from "./jobs.routes.js";
import contentRouter from "./content.routes.js";
import testimonialsRouter from "./testimonials.routes.js";
import { requireAdminAuth } from "../middleware/requireAdminAuth.js";

const router = Router();

/**
 * `/auth/*` mounts first and unguarded — login/logout must be reachable with
 * no cookie yet. Everything after this line requires a valid `admin_session`.
 */
router.use("/auth", authRouter);
router.use(requireAdminAuth);

router.use("/users", usersRouter);
router.use("/statements", statementsRouter);
router.use("/jobs", jobsRouter);
router.use("/content", contentRouter);
router.use("/testimonials", testimonialsRouter);

export default router;
