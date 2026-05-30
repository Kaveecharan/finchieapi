import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ID format");

const categoryRef = z.object({
  _id: objectId,
  name: z.string().min(1).max(100).trim(),
});

const imageRef = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
});

// Date must be at least tomorrow (UTC midnight).
const futureDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
  .refine((d) => {
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return new Date(d) >= tomorrow;
  }, "Date must be in the future");

const expenseFields = z.object({
  transactionType: z.literal("expense"),
  itemName: z.string().min(1, "Item name required").max(200).trim(),
  subCategory: categoryRef.nullable().optional(),
});

const incomeFields = z.object({
  transactionType: z.literal("income"),
  incomeType: z.string().min(1, "Income type required").max(100).trim(),
  whose: z.string().max(200).trim().optional().default(""),
});

const commonFields = z.object({
  amount:   z.number().positive("Amount must be positive").max(999_999_999),
  date:     futureDate,
  category: categoryRef,
  note:     z.string().max(500).trim().optional().default(""),
  images:   z.array(imageRef).max(2).optional().default([]),
});

export const createUpcomingSchema = z.discriminatedUnion("transactionType", [
  commonFields.merge(expenseFields),
  commonFields.merge(incomeFields),
]);

export const updateUpcomingSchema = z.object({
  amount:      z.number().positive().max(999_999_999).optional(),
  date:        futureDate.optional(),
  category:    categoryRef.optional(),
  note:        z.string().max(500).trim().optional(),
  images:      z.array(imageRef).max(2).optional(),
  // Expense-only
  itemName:    z.string().min(1).max(200).trim().optional(),
  subCategory: categoryRef.nullable().optional(),
  // Income-only
  incomeType:  z.string().min(1).max(100).trim().optional(),
  whose:       z.string().max(200).trim().optional(),
});

export const listUpcomingSchema = z.object({
  status:          z.enum(["pending", "approved", "declined"]).optional().default("pending"),
  transactionType: z.enum(["expense", "income"]).optional(),
  limit:           z.coerce.number().int().positive().max(100).optional(),
  page:            z.coerce.number().int().positive().optional(),
});
