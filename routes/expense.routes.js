import express from "express";
import { expenseController } from "../controllers/expense.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../validators/validate.js";
import { enforceHistoryLimit } from "../middleware/premium.js";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpenseSchema,
} from "../validators/expense.validators.js";

const router = express.Router();

router.use(authenticate);

router.get("/", validate(listExpenseSchema, "query"), enforceHistoryLimit, expenseController.list);
router.post("/", validate(createExpenseSchema), expenseController.create);
router.get("/:id", expenseController.getOne);
router.patch("/:id/approve", expenseController.approve);
router.put("/:id", validate(updateExpenseSchema), expenseController.update);
router.delete("/:id", expenseController.delete);

export default router;
