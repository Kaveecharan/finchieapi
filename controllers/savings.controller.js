import { savingsService } from "../services/savings.service.js";
import { asyncHandler }   from "../utils/asyncHandler.js";

export const savingsController = {
  // GET /savings
  list: asyncHandler(async (req, res) => {
    const data = await savingsService.getSavings(req.user.userId);
    res.json({ success: true, data });
  }),

  // POST /savings
  create: asyncHandler(async (req, res) => {
    const goal = await savingsService.createGoal(req.user.userId, req.body);
    res.status(201).json({ success: true, data: goal });
  }),

  // PUT /savings/:id
  update: asyncHandler(async (req, res) => {
    const goal = await savingsService.updateGoal(req.user.userId, req.params.id, req.body);
    res.json({ success: true, data: goal });
  }),

  // POST /savings/:id/deposit
  addDeposit: asyncHandler(async (req, res) => {
    const result = await savingsService.addDeposit(req.user.userId, req.params.id, req.body);
    res.status(201).json({ success: true, data: result });
  }),

  // DELETE /savings/:id/deposit/:depositId
  removeDeposit: asyncHandler(async (req, res) => {
    const result = await savingsService.removeDeposit(
      req.user.userId, req.params.id, req.params.depositId
    );
    res.json({ success: true, data: result });
  }),

  // POST /savings/:id/finish
  finish: asyncHandler(async (req, res) => {
    const goal = await savingsService.finishGoal(req.user.userId, req.params.id);
    res.json({ success: true, data: goal });
  }),

  // DELETE /savings/:id
  delete: asyncHandler(async (req, res) => {
    await savingsService.deleteGoal(req.user.userId, req.params.id);
    res.json({ success: true });
  }),

  // GET /savings/:id/deposits
  getDeposits: asyncHandler(async (req, res) => {
    const deposits = await savingsService.getDeposits(req.user.userId, req.params.id);
    res.json({ success: true, data: deposits });
  }),

  // GET /savings/:id
  getGoalDetail: asyncHandler(async (req, res) => {
    const data = await savingsService.getGoalDetail(req.user.userId, req.params.id);
    res.json({ success: true, data });
  }),

  // POST /savings/:id/deduct
  deductSavings: asyncHandler(async (req, res) => {
    const result = await savingsService.deductSavings(req.user.userId, req.params.id, req.body);
    res.status(201).json({ success: true, data: result });
  }),

  // PUT /savings/deposit/:depositId
  updateDeposit: asyncHandler(async (req, res) => {
    const result = await savingsService.updateDeposit(req.user.userId, req.params.depositId, req.body);
    res.json({ success: true, data: result });
  }),
};
