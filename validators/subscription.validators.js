import { z } from "zod";

export const confirmPaymentSchema = z.object({
  paymentMethodId: z
    .string()
    .regex(/^pm_[a-zA-Z0-9_]+$/, "Invalid Stripe payment method ID"),
});
