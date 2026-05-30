import axios from "axios";
import { logger } from "../utils/logger.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Send a single Expo push notification.
// pushToken must start with "ExponentPushToken[" — silently skips invalid tokens.
export const sendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!pushToken || !String(pushToken).startsWith("ExponentPushToken")) return;

  try {
    await axios.post(
      EXPO_PUSH_URL,
      { to: pushToken, title, body, data, sound: "default", priority: "high" },
      { headers: { "Content-Type": "application/json", Accept: "application/json" }, timeout: 8000 }
    );
  } catch (err) {
    logger.warn({ event: "push_notification_failed", token: pushToken, err: err.message });
  }
};

// Send to multiple tokens in parallel.
export const sendPushNotificationBatch = (notifications) =>
  Promise.allSettled(
    notifications.map(({ token, title, body, data }) =>
      sendPushNotification(token, title, body, data)
    )
  );
