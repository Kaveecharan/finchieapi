import mongoose from "mongoose";

const savingGoalSchema = new mongoose.Schema(
  {
    userId:        { type: String, required: true, index: true },
    title:         { type: String, required: true, trim: true, maxlength: 100 },
    plannedAmount: { type: Number, required: true, min: 0.01 },
    currentAmount: { type: Number, default: 0, min: 0 },
    deadline:      { type: Date, required: true },
    note:          { type: String, trim: true, maxlength: 500, default: "" },
    status:        { type: String, enum: ["active", "completed"], default: "active", index: true },
    completedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SavingGoal", savingGoalSchema);
