import { Router } from "express";
import * as adminUsersController from "../controllers/admin-users.controller.js";
import { validate } from "../../middleware/validate.js";
import { listAdminUsersQuerySchema, setAdminUserPlanSchema } from "../validators/admin-users.validator.js";

const router = Router();

router.get("/", validate(listAdminUsersQuerySchema, "query"), adminUsersController.listUsers);
router.get("/:id", adminUsersController.getUser);
router.post("/:id/plan", validate(setAdminUserPlanSchema), adminUsersController.setUserPlan);

export default router;
