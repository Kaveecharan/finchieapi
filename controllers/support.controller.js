import { sendSupportEmail } from "../services/email.service.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../utils/logger.js";
import SupportTicket from "../models/SupportTicket.js";

export const supportController = {
  contact: async (req, res) => {
    const { email, subject, message } = req.body;
    const userId = req.user?.userId;

    try {
      await sendSupportEmail(email, subject, message, userId);
      logger.info({ event: "support_email_sent", userId, subject });
      res.json({ success: true, message: "Your message has been sent." });
    } catch (err) {
      logger.error({ event: "support_email_failed", userId, err: err.message });
      throw new AppError(500, "Failed to send your message. Please try again.", "EMAIL_SEND_FAILED");
    }

    // Persist ticket to DB for admin visibility (non-blocking — never fails the request)
    SupportTicket.create({
      userId,
      email,
      subject,
      messages: [{ from: "user", content: message }],
    }).catch((err) => logger.warn({ event: "support_ticket_save_failed", err: err.message }));
  },
};
