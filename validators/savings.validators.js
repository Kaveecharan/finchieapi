import { z } from "zod";

export const createGoalSchema = z.object({
  title:         z.string().min(1, "title is required").max(200).trim(),
  plannedAmount: z.number({ invalid_type_error: "plannedAmount must be a number" }).positive("plannedAmount must be greater than 0"),
  deadline:      z.string().min(1, "deadline is required"),
  note:          z.string().max(500).trim().optional(),
});

export const updateGoalSchema = z.object({
  title:    z.string().min(1).max(200).trim().optional(),
  deadline: z.string().optional(),
  note:     z.string().max(500).trim().optional(),
});

export const addDepositSchema = z.object({
  amount: z.number({ invalid_type_error: "amount must be a number" }).positive("amount must be greater than 0"),
  note:   z.string().max(500).trim().optional(),
});

export const updateDepositSchema = z.object({
  amount: z.number({ invalid_type_error: "amount must be a number" }).positive("amount must be greater than 0").optional(),
  note:   z.string().max(500).trim().optional(),
});

export const deductSavingsSchema = z.object({
  amount: z.number({ invalid_type_error: "amount must be a number" }).positive("amount must be greater than 0"),
  reason: z.string().max(500).trim().optional(),
});
