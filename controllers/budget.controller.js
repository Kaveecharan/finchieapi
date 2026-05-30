import { asyncHandler } from "../utils/asyncHandler.js";
import Budget from "../models/Budget.js";
import Category from "../models/Category.js";

const budgetController = {
  list: asyncHandler(async (req, res) => {
    const uid = req.user.userId;
    const budgets = await Budget.find({ userId: uid }).sort({ categoryName: 1 });
    res.json({ success: true, data: budgets });
  }),

  upsert: asyncHandler(async (req, res) => {
    const uid = req.user.userId;
    const { categoryName, amount } = req.body;
    const name = categoryName?.trim();
    if (!name) return res.status(400).json({ error: "categoryName is required" });
    const num = Number(amount);
    if (isNaN(num) || num < 0) return res.status(400).json({ error: "amount must be a non-negative number" });

    // Ensure the category exists as an expense category so it appears in the dropdown
    let category = await Category.findOne({ userId: uid, name, type: "expense" });
    if (!category) {
      category = await Category.create({ userId: uid, name, type: "expense" });
    }

    const budget = await Budget.findOneAndUpdate(
      { userId: uid, categoryName: name },
      { categoryId: category._id, amount: num },
      { upsert: true, new: true, runValidators: true }
    );
    res.json({ success: true, data: budget });
  }),

  remove: asyncHandler(async (req, res) => {
    const uid = req.user.userId;
    await Budget.deleteOne({ _id: req.params.id, userId: uid });
    res.json({ success: true });
  }),
};

export default budgetController;
