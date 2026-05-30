import { z } from "zod";

export const updateProfileSchema = z.object({
  username:    z.string().min(3).max(30).trim().regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, underscores").optional(),
  displayName: z.string().min(1).max(50).trim().optional(),
  firstName:   z.string().min(1).max(50).trim().optional(),
  lastName:    z.string().max(50).trim().optional(),
  profession:  z.string().max(100).trim().optional(),
  currency:    z.string().max(10).trim().optional(),
  country:     z.string().max(100).trim().optional(),
  address:     z.string().max(500).trim().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const updateAvatarSchema = z.object({
  avatarUrl: z.string().url("Invalid URL"),
  publicId:  z.string().min(1),
});

export const updateEmailSchema = z.object({
  newEmail: z.string().email("Invalid email address").toLowerCase(),
  password: z.string().min(1, "Password required"),
});

export const updatePhoneSchema = z.object({
  phoneNumber: z.string().min(4).max(20).nullable().optional(),
  countryCode: z.string().min(1).max(10).nullable().optional(),
});

export const deactivateSchema = z.object({
  password: z.string().min(1, "Password required"),
});
