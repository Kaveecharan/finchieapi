import { asyncHandler } from "../utils/asyncHandler.js";
import { chatService } from "../services/chat.service.js";

export const chatController = {
  // POST /chat/message
  sendMessage: asyncHandler(async (req, res) => {
    const { text } = req.body;
    const result = await chatService.sendMessage(req.user.userId, text);
    res.json({ success: true, data: result });
  }),

  // GET /chat/history
  getHistory: asyncHandler(async (req, res) => {
    const limit   = Math.min(parseInt(req.query.limit, 10) || 40, 100);
    const messages = await chatService.getHistory(req.user.userId, limit);
    res.json({ success: true, data: { messages } });
  }),

  // GET /chat/usage
  getUsage: asyncHandler(async (req, res) => {
    const usage = await chatService.getUsage(req.user.userId);
    res.json({ success: true, data: usage });
  }),

  // DELETE /chat/history
  clearHistory: asyncHandler(async (req, res) => {
    await chatService.clearHistory(req.user.userId);
    res.json({ success: true });
  }),
};
