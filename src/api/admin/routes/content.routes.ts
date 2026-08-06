import { Router } from "express";
import * as adminContentController from "../controllers/admin-content.controller.js";
import { validate } from "../../middleware/validate.js";
import { putContentSchema } from "../validators/admin-content.validator.js";

const router = Router();

router.get("/", adminContentController.listContent);
router.put("/", validate(putContentSchema), adminContentController.putContent);

export default router;
