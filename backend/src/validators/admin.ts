import { z } from "zod";

const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

const passwordField = z
  .string({ required_error: "password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be at most 100 characters");

export const createUserSchema = z
  .object({
    full_name: z
      .string({ required_error: "full_name is required" })
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must be at most 100 characters"),
    email: z.string({ required_error: "email is required" }).trim().email("Invalid email address"),
    phone_number: z
      .string({ required_error: "phone_number is required" })
      .trim()
      .regex(PHONE_REGEX, "Invalid phone number"),
    department_id: z.coerce.number().int().positive("Invalid department"),
    role: z.enum(["STAFF", "ADMIN"]).default("STAFF"),
    status: z.enum(["PENDING", "ACTIVE", "REJECTED"]).default("ACTIVE"),
    password: passwordField,
    confirm_password: z.string({ required_error: "confirm_password is required" })
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"]
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must be at most 100 characters")
      .optional(),
    email: z.string().trim().email("Invalid email address").optional(),
    phone_number: z.string().trim().regex(PHONE_REGEX, "Invalid phone number").optional(),
    department_id: z.coerce.number().int().positive("Invalid department").optional(),
    role: z.enum(["STAFF", "ADMIN"]).optional(),
    status: z.enum(["PENDING", "ACTIVE", "REJECTED"]).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided"
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirm_password: z.string({ required_error: "confirm_password is required" })
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"]
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const userListQuerySchema = z.object({
  search: z.string().trim().optional(),
  role: z.enum(["STAFF", "ADMIN"]).optional(),
  status: z.enum(["PENDING", "ACTIVE", "REJECTED"]).optional(),
  department: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;