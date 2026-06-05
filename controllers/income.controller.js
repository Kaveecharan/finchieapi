import { incomeService } from "../services/income.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const incomeController = {
  list: asyncHandler(async (req, res) => {
    const result = await incomeService.list(req.user.userId, req.query);
    res.json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req, res) => {
    const income = await incomeService.getOne(req.params.id, req.user.userId);
    res.json({ success: true, data: income });
  }),

  create: asyncHandler(async (req, res) => {
    const income = await incomeService.create(req.user.userId, req.body);
    res.status(201).json({ success: true, data: income });
  }),

  update: asyncHandler(async (req, res) => {
    const income = await incomeService.update(req.params.id, req.user.userId, req.body);
    res.json({ success: true, data: income });
  }),

  delete: asyncHandler(async (req, res) => {
    await incomeService.delete(req.params.id, req.user.userId);
    res.json({ success: true, message: "Income record deleted" });
  }),

  approve: asyncHandler(async (req, res) => {
    const income = await incomeService.approve(req.params.id, req.user.userId);
    res.json({ success: true, data: income });
  }),
};
