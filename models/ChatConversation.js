import mongoose from "mongoose";

// One document per user — messages are appended and trimmed in place.
// Max MAX_MESSAGES are kept; older messages are sliced off on each write.

export const MAX_MESSAGES = 100; // soft cap stored in DB
export const HISTORY_WINDOW = 3; // messages sent to OpenAI as context

const messageSchema = new mongoose.Schema(
  {
    role:      { type: String, enum: ["user", "assistant"], required: true },
    content:   { type: String, required: true },
    type:      { type: String, enum: ["A", "B", "quota", "error"], default: "B" },
    createdAt: { type: Date,   default: Date.now },
  },
  { _id: false }
);

const chatConversationSchema = new mongoose.Schema(
  {
    userId:   { type: String, required: true, unique: true, index: true },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("ChatConversation", chatConversationSchema);
