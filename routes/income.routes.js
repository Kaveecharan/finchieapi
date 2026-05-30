import express from "express";
import { incomeController } from "../controllers/income.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../validators/validate.js";
import {
  createIncomeSchema,
  updateIncomeSchema,
  listIncomeSchema,
} from "../validators/income.validators.js";

const router = express.Router();

router.use(authenticate);

router.get("/", validate(listIncomeSchema, "query"), incomeController.list);
router.post("/", validate(createIncomeSchema), incomeController.create);
router.get("/:id", incomeController.getOne);
router.put("/:id", validate(updateIncomeSchema), incomeController.update);
router.delete("/:id", incomeController.delete);

export default router;
