import { Router } from "express";
import * as adminJobsController from "../controllers/admin-jobs.controller.js";
import { validate } from "../../middleware/validate.js";
import { listAdminJobsQuerySchema } from "../validators/admin-jobs.validator.js";

const router = Router();

router.get("/", validate(listAdminJobsQuerySchema, "query"), adminJobsController.listJobs);

export default router;
