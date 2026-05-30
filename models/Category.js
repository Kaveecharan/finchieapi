import mongoose from "mongoose";

const subCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false }
);

const categorySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    type: { type: String, required: true, enum: ["expense", "income"], index: true },
    color: { type: String, default: "#4A8A66", maxlength: 20 },
    icon: { type: String, default: "ellipse", maxlength: 50 },
    isDefault: { type: Boolean, default: false },
    subCategories: { type: [subCategorySchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

// Fast user+type lookups and uniqueness per user
categorySchema.index({ userId: 1, type: 1 });
categorySchema.index({ userId: 1, name: 1, type: 1 }, { unique: true });

export default mongoose.model("Category", categorySchema);
