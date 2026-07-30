import { Router } from "express";
import * as usersController from "../controllers/users.controller.js";
import * as plansController from "../controllers/plans.controller.js";
import { avatarLimiter } from "../middleware/rateLimiter.js";
import { avatarUploadMiddleware } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { setPlanSchema } from "../validators/plans.validator.js";

const router = Router();

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: The signed-in user's profile
 *     responses:
 *       200:
 *         description: Profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                     email: { type: string, format: email }
 *                     image: { type: string, nullable: true, description: "Absolute URL — this API's /avatars route, or the provider's (e.g. Google)" }
 *                     emailVerified: { type: boolean }
 *                     createdAt: { type: string, format: date-time }
 *       401: { description: Not authenticated }
 */
router.get("/me", usersController.getMe);

/**
 * @openapi
 * /users/me/avatar:
 *   post:
 *     tags: [Users]
 *     summary: Upload a profile picture
 *     description: >
 *       Multipart, field name `avatar`. JPEG, PNG or WebP, max 2MB. Replaces any
 *       existing picture and deletes the previously stored file — including one
 *       inherited from an OAuth provider, whose remote image is simply
 *       dereferenced rather than deleted. Rate limited to 20/hour.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200: { description: Updated profile, with the new image URL }
 *       400: { description: Missing file, or not an accepted image type }
 *       401: { description: Not authenticated }
 *       413: { description: File exceeds 2MB }
 *       429: { description: AVATAR_RATE_LIMITED }
 */
router.post("/me/avatar", avatarLimiter, avatarUploadMiddleware, usersController.uploadAvatar);

/**
 * @openapi
 * /users/me/avatar:
 *   delete:
 *     tags: [Users]
 *     summary: Remove the profile picture
 *     description: >
 *       Clears `image` and deletes the stored file if one exists. A picture that
 *       came from an OAuth provider is cleared too — signing in with that
 *       provider again will re-populate it.
 *     responses:
 *       200: { description: Updated profile, image null }
 *       401: { description: Not authenticated }
 */
router.delete("/me/avatar", usersController.deleteAvatar);

/**
 * @openapi
 * /users/me/entitlements:
 *   get:
 *     tags: [Users, Plans]
 *     summary: What the signed-in user's plan allows, and how much they have used
 *     description: >
 *       One call carrying both the rules and the counters, because the app reads
 *       it once per session and seeds it into its client cache — three separate
 *       usage counters fetched per screen would be the alternative. `limits`
 *       values of `null` mean unlimited.
 *     responses:
 *       200:
 *         description: Entitlements
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { type: string, enum: [first, glow, radiant] }
 *                     planName: { type: string, example: "Glow" }
 *                     features:
 *                       type: object
 *                       additionalProperties: { type: boolean }
 *                     limits:
 *                       type: object
 *                       properties:
 *                         statements: { type: integer, nullable: true }
 *                         goals: { type: integer, nullable: true }
 *                     usage:
 *                       type: object
 *                       properties:
 *                         statements: { type: integer }
 *                         banks: { type: integer, description: "Distinct bank names uploaded" }
 *                         goals: { type: integer, description: "Goals that are active or being checked" }
 *       401: { description: Not authenticated }
 */
router.get("/me/entitlements", plansController.getMyEntitlements);

/**
 * Change your own plan — **development only**.
 *
 * There is no billing integration, so this is how a plan is exercised while the
 * feature is built. It is mounted conditionally rather than guarded inside the
 * handler so that in production the route genuinely does not exist (404), which
 * is a stronger statement than a 403 from a handler that shipped. The same
 * posture `goals.service.ts` takes with the `force` stale-data override.
 *
 * The ops path for a real deployment is `npm run grant:plan`.
 */
if (process.env.NODE_ENV !== "production") {
    /**
     * @openapi
     * /users/me/plan:
     *   post:
     *     tags: [Users, Plans]
     *     summary: "Set your own plan (development builds only — absent in production)"
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [plan]
     *             properties:
     *               plan: { type: string, enum: [first, glow, radiant] }
     *     responses:
     *       200: { description: The plan now in force }
     *       400: { description: Unknown plan id }
     *       401: { description: Not authenticated }
     */
    router.post("/me/plan", validate(setPlanSchema), plansController.setMyPlan);
}

export default router;
