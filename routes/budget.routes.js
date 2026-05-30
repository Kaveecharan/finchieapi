import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import budgetController from "../controllers/budget.controller.js";

const router = express.Router();

router.use(authenticate);

router.get("/",      budgetController.list);
router.post("/",     budgetController.upsert);
router.delete("/:id", budgetController.remove);

export default router;
