import { RequestHandler } from "express";
import { ZodError, ZodSchema } from "zod";
import { fail } from "../utils/apiResponse";

type Source = "body" | "query" | "params";

export function validate(schema: ZodSchema, source: Source = "body"): RequestHandler {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message
        }));
        return fail(res, 422, "Validation failed", details);
      }
      return fail(res, 400, "Invalid request");
    }
  };
}
