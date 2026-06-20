import express from "express";
import { savingsController } from "../controllers/savings.controller.js";
import { authenticate }      from "../middleware/authenticate.js";
import { validate }          from "../validators/validate.js";
import {
  createGoalSchema,
  updateGoalSchema,
  addDepositSchema,
  updateDepositSchema,
  deductSavingsSchema,
} from "../validators/savings.validators.js";

const router = express.Router();
router.use(authenticate);

router.get("/",                              savingsController.list);
router.post("/",                             validate(createGoalSchema),   savingsController.create);
// Specific deposit-level route registered before /:id to avoid param shadowing
router.put("/deposit/:depositId",            validate(updateDepositSchema), savingsController.updateDeposit);
router.get("/:id",                           savingsController.getGoalDetail);
router.put("/:id",                           validate(updateGoalSchema),   savingsController.update);
router.post("/:id/deposit",                  validate(addDepositSchema),   savingsController.addDeposit);
router.delete("/:id/deposit/:depositId",     savingsController.removeDeposit);
router.post("/:id/deduct",                   validate(deductSavingsSchema), savingsController.deductSavings);
router.post("/:id/finish",                   savingsController.finish);
router.delete("/:id",                        savingsController.delete);
router.get("/:id/deposits",                  savingsController.getDeposits);

export default router;
