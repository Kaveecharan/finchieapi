import { z } from "zod";

export const submitSupportSchema = z.object({
  email:   z.string().trim().email("Enter a valid email address").max(254),
  subject: z.string().trim().min(1, "Subject is required").max(100, "Subject must be under 100 characters"),
  message: z.string().trim().min(50, "Message must be at least 50 characters").max(500, "Message must be under 500 characters"),
});

export const webContactSchema = z.object({
  name:    z.string().trim().min(1, "Name is required").max(100),
  email:   z.string().trim().email("Enter a valid email address").max(254),
  subject: z.string().trim().min(1, "Subject is required").max(100, "Subject must be under 100 characters"),
  message: z.string().trim().min(20, "Message must be at least 20 characters").max(2000, "Message must be under 2000 characters"),
});
