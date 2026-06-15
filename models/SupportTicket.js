import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const messageSchema = new mongoose.Schema(
  {
    from:      { type: String, enum: ["user", "admin"], required: true },
    content:   { type: String, required: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SupportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
      immutable: true,
    },
    userId:  { type: String, index: true },
    email:   { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, required: true, maxlength: 200 },

    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },

    messages:   { type: [messageSchema], default: [] },
    adminNotes: { type: String, maxlength: 2000, select: false },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ createdAt: -1 });
SupportTicketSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("SupportTicket", SupportTicketSchema);
