import mongoose from "mongoose";

const categoryRefSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const subCategoryRefSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    itemName: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: categoryRefSchema, required: true },
    subCategory: { type: subCategoryRefSchema, default: null },
    // "active" = counted in balance/analytics; "pending" = scheduled, excluded from all calculations
    status: { type: String, enum: ["active", "pending"], default: "active", index: true },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    images: {
      type: [{ url: { type: String, required: true }, publicId: { type: String, required: true } }],
      default: [],
      validate: { validator: (arr) => arr.length <= 2, message: "Maximum 2 images allowed" },
    },
  },
  { timestamps: true, versionKey: false }
);

// Compound indexes for most common query patterns
expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, "category._id": 1, date: -1 });
expenseSchema.index({ userId: 1, date: -1, "category._id": 1 });
expenseSchema.index(
  { userId: 1, itemName: "text", note: "text" },
  { name: "expense_text_search" }
);

export default mongoose.model("Expense", expenseSchema);
