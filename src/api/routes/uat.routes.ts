import { Router } from "express";
import * as uatController from "../controllers/uat.controller.js";

/**
 * UAT testing — public, unauthenticated, entirely gated by UAT_TESTING_FLAG
 * (src/config/uat.ts). No @openapi annotations here on purpose: this is a
 * testing-only affordance, not a documented product surface.
 */
const router = Router();

router.get("/config", uatController.getConfig);
router.get("/test-pdfs", uatController.listTestPdfs);
router.get("/test-pdfs/:id/download", uatController.downloadTestPdf);
router.get("/testers", uatController.listTesters);

export default router;
