import mongoose from "mongoose";

const categoryRefSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const incomeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: categoryRefSchema, default: null },
    whose: { type: String, trim: true, maxlength: 200, default: "" },
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
incomeSchema.index({ userId: 1, date: -1 });
incomeSchema.index({ userId: 1, type: 1, date: -1 });
incomeSchema.index({ userId: 1, "category._id": 1, date: -1 });
incomeSchema.index(
  { userId: 1, whose: "text", note: "text" },
  { name: "income_text_search" }
);

export default mongoose.model("Income", incomeSchema);
