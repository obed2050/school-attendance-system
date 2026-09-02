import { RequestHandler } from "express";
import { ApiError } from "../utils/ApiError";
import { AuthUser } from "../types/auth";

export function requireRole(role: AuthUser["role"]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }
    if (req.user.role !== role) {
      return next(new ApiError(403, "Insufficient permissions"));
    }
    next();
  };
}
