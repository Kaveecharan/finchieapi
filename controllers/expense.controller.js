import { expenseService } from "../services/expense.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const expenseController = {
  list: asyncHandler(async (req, res) => {
    const result = await expenseService.list(req.user.userId, req.query);
    res.json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req, res) => {
    const expense = await expenseService.getOne(req.params.id, req.user.userId);
    res.json({ success: true, data: expense });
  }),

  create: asyncHandler(async (req, res) => {
    const expense = await expenseService.create(req.user.userId, req.body);
    res.status(201).json({ success: true, data: expense });
  }),

  update: asyncHandler(async (req, res) => {
    const expense = await expenseService.update(req.params.id, req.user.userId, req.body);
    res.json({ success: true, data: expense });
  }),

  delete: asyncHandler(async (req, res) => {
    await expenseService.delete(req.params.id, req.user.userId);
    res.json({ success: true, message: "Expense deleted" });
  }),
};
