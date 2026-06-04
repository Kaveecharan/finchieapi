import express from "express";
import { savingsController } from "../controllers/savings.controller.js";
import { authenticate }      from "../middleware/authenticate.js";

const router = express.Router();
router.use(authenticate);

router.get("/",                              savingsController.list);
router.post("/",                             savingsController.create);
// Specific deposit-level route registered before /:id to avoid param shadowing
router.put("/deposit/:depositId",            savingsController.updateDeposit);
router.get("/:id",                           savingsController.getGoalDetail);
router.put("/:id",                           savingsController.update);
router.post("/:id/deposit",                  savingsController.addDeposit);
router.delete("/:id/deposit/:depositId",     savingsController.removeDeposit);
router.post("/:id/deduct",                   savingsController.deductSavings);
router.post("/:id/finish",                   savingsController.finish);
router.delete("/:id",                        savingsController.delete);
router.get("/:id/deposits",                  savingsController.getDeposits);

export default router;
