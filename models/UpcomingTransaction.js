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

const imageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, publicId: { type: String, required: true } },
  { _id: false }
);

const upcomingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    transactionType: { type: String, enum: ["expense", "income"], required: true },

    // Common
    amount: { type: Number, required: true, min: 0.01 },
    date:   { type: Date, required: true },
    category: { type: categoryRefSchema, required: true },
    note:   { type: String, trim: true, maxlength: 500, default: "" },
    images: {
      type: [imageSchema],
      default: [],
      validate: { validator: (arr) => arr.length <= 2, message: "Maximum 2 images allowed" },
    },

    // Expense-only
    itemName:    { type: String, trim: true, maxlength: 200 },
    subCategory: { type: subCategoryRefSchema, default: null },

    // Income-only
    incomeType: { type: String, trim: true, maxlength: 100 },
    whose:      { type: String, trim: true, maxlength: 200, default: "" },

    // Lifecycle
    status: {
      type: String,
      enum: ["pending", "approved", "declined"],
      default: "pending",
      index: true,
    },
    declinedAt: { type: Date },

    // Track whether notifications have been sent for this item's date
    morningNotifSent: { type: Boolean, default: false },
    eveningNotifSent: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

upcomingSchema.index({ userId: 1, date: 1, status: 1 });
upcomingSchema.index({ status: 1, declinedAt: 1 });
upcomingSchema.index({ date: 1, status: 1, morningNotifSent: 1 });
upcomingSchema.index({ date: 1, status: 1, eveningNotifSent: 1 });

export default mongoose.model("UpcomingTransaction", upcomingSchema);
