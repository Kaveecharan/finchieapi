import mongoose from "mongoose";

// amount is always stored positive.
// type = "deposit"   → adds to the goal total.
// type = "deduction" → subtracts from the goal total AND creates an Expense entry.
const savingsContributionSchema = new mongoose.Schema(
  {
    goalId:    { type: mongoose.Schema.Types.ObjectId, ref: "SavingsGoal", required: true, index: true },
    userId:    { type: String, required: true, index: true },
    amount:    { type: Number, required: true, min: 0.01 },
    note:      { type: String, trim: true, maxlength: 500, default: "" },
    date:      { type: Date, default: Date.now },
    type:      { type: String, enum: ["deposit", "deduction"], required: true },
    // Only populated for deductions — links back to the auto-created Expense document.
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: "Expense", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SavingsContribution", savingsContributionSchema);
