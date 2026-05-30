import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1, "Name required").max(100).trim(),
  type: z.enum(["expense", "income"], { required_error: "Type required" }),
  color: z.string().max(20).optional(),
  icon: z.string().max(50).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const addSubCategorySchema = z.object({
  name: z.string().min(1, "Sub-category name required").max(100).trim(),
});

export const listCategorySchema = z.object({
  type: z.enum(["expense", "income"]).optional(),
  search: z.string().max(100).trim().optional(),
});
