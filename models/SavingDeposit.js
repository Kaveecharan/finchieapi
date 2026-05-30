import mongoose from "mongoose";

const savingDepositSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "SavingGoal", required: true, index: true },
    userId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    note:   { type: String, trim: true, maxlength: 200, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("SavingDeposit", savingDepositSchema);
