import { Router } from "express";
import * as adminAuthController from "../controllers/admin-auth.controller.js";
import { requireAdminAuth } from "../middleware/requireAdminAuth.js";
import { adminLoginLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";
import { adminLoginSchema } from "../validators/admin-auth.validator.js";

const router = Router();

// No @openapi JSDoc anywhere in src/api/admin/ — see swagger.ts's routesDir glob.
router.post("/login", adminLoginLimiter, validate(adminLoginSchema), adminAuthController.login);
router.post("/logout", adminAuthController.logout);
router.get("/me", requireAdminAuth, adminAuthController.me);

export default router;
