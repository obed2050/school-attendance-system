import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import {
  signupHandler,
  loginHandler,
  meHandler,
  faceReferenceHandler
} from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import {
  signupSchema,
  loginSchema,
  faceReferenceSchema
} from "../validators/auth";

const router = Router();

const isTest = env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 100000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please try again later." }
});

router.post("/signup", authLimiter, validate(signupSchema), signupHandler);
router.post("/login", loginLimiter, validate(loginSchema), loginHandler);
router.get("/me", requireAuth, meHandler);
router.put(
  "/face-reference",
  requireAuth,
  validate(faceReferenceSchema),
  faceReferenceHandler
);

export default router;
