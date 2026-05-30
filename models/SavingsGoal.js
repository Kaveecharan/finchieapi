import mongoose from "mongoose";

const savingsGoalSchema = new mongoose.Schema(
  {
    userId:     { type: String, required: true, index: true },
    title:      { type: String, required: true, trim: true, maxlength: 100 },
    targetDate: { type: Date,   default: null },
    isActive:   { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("SavingsGoal", savingsGoalSchema);
