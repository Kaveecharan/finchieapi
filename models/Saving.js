import mongoose from "mongoose";

const savingSchema = new mongoose.Schema(
  {
    userId:      { type: String, required: true, index: true },
    title:       { type: String, required: true, trim: true, maxlength: 100 },
    amount:      { type: Number, required: true, min: 0.01 },
    status:      { type: String, enum: ["active", "completed"], default: "active", index: true },
    note:        { type: String, trim: true, maxlength: 500, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Saving", savingSchema);
