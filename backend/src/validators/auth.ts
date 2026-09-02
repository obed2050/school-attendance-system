import { z } from "zod";

const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

export const signupSchema = z
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
    password: z
      .string({ required_error: "password is required" })
      .min(8, "Password must be at least 8 characters")
      .max(100, "Password must be at most 100 characters"),
    confirm_password: z.string({ required_error: "confirm_password is required" })
  })
  // Never accept role/status overrides on public signup.
  .strip()
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"]
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string({ required_error: "email is required" }).trim().email("Invalid email address"),
  password: z.string({ required_error: "password is required" }).min(1, "Password is required")
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Face reference enrollment. The embedding is the only biometric material
 * that ever reaches the server; it is encrypted at rest. The shape is
 * strictly validated (exactly 128 finite numbers) so arbitrary payloads are
 * discarded before they reach storage.
 */
const embeddingDef = z
  .array(z.number().finite())
  .length(128, "face embedding must contain exactly 128 numbers")
  .refine(
    (values) => values.every((value) => Math.abs(value) <= 100),
    "embedding values are out of range"
  );

export const faceReferenceSchema = z.object({
  embedding: embeddingDef,
  current_embedding: embeddingDef.optional()
});

export type FaceReferenceInput = z.infer<typeof faceReferenceSchema>;
