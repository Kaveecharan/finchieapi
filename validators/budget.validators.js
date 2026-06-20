import { z } from "zod";

export const upsertBudgetSchema = z.object({
  categoryName: z.string().min(1, "categoryName is required").max(100).trim(),
  amount:       z.number({ invalid_type_error: "amount must be a number" }).nonnegative("amount must be non-negative"),
});
