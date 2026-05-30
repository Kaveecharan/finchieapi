import mongoose from "mongoose";

const budgetSchema = new mongoose.Schema(
  {
    userId:       { type: String, required: true },
    categoryId:   { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    categoryName: { type: String, required: true, trim: true },
    amount:       { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

budgetSchema.index({ userId: 1, categoryName: 1 }, { unique: true });

export default mongoose.model("Budget", budgetSchema);
