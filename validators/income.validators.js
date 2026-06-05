import { z } from "zod";

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid ID format");

const categoryRef = z.object({
  _id: objectId,
  name: z.string().min(1).max(100).trim(),
});

export const createIncomeSchema = z.object({
  date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  amount: z.number().positive("Amount must be positive").max(999_999_999),
  type: z.string().min(1, "Type required").max(100).trim(),
  category: categoryRef,
  whose: z.string().max(200).trim().optional().default(""),
  note: z.string().max(500).trim().optional().default(""),
  images: z.array(
    z.object({ url: z.string().url(), publicId: z.string().min(1) })
  ).max(2).optional().default([]),
});

export const updateIncomeSchema = createIncomeSchema.partial();

export const listIncomeSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  type: z.string().max(100).optional(),
  categoryId: objectId.optional(),
  whose: z.string().max(200).optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  search: z.string().max(100).trim().optional(),
  sortField: z.enum(["date", "amount", "type", "whose"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  status: z.enum(["active", "pending"]).optional(),
});
