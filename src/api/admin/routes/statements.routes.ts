import { Router } from "express";
import * as adminStatementsController from "../controllers/admin-statements.controller.js";
import * as adminStatementsRetryController from "../controllers/admin-statements-retry.controller.js";
import { validate } from "../../middleware/validate.js";
import { listAdminStatementsQuerySchema } from "../validators/admin-statements.validator.js";

const router = Router();

router.get("/", validate(listAdminStatementsQuerySchema, "query"), adminStatementsController.listStatements);
router.get("/:id", adminStatementsController.getStatement);
router.post("/:id/retry", adminStatementsRetryController.retryStatement);

export default router;
