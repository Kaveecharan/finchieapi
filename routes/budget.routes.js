import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../validators/validate.js";
import { upsertBudgetSchema } from "../validators/budget.validators.js";
import budgetController from "../controllers/budget.controller.js";

const router = express.Router();

router.use(authenticate);

router.get("/",       budgetController.list);
router.post("/",      validate(upsertBudgetSchema), budgetController.upsert);
router.delete("/:id", budgetController.remove);

export default router;
