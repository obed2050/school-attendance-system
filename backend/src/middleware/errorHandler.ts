import { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

interface PrismaErrorMapping {
  code: string;
  status: number;
  message: string;
}

const PRISMA_ERRORS: PrismaErrorMapping[] = [
  {
    code: "P2002",
    status: 409,
    message: "A record with the same unique value already exists."
  },
  {
    code: "P2025",
    status: 404,
    message: "The requested record does not exist."
  },
  {
    code: "P2003",
    status: 400,
    message: "Referenced record does not exist."
  }
];

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  return next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode = 500;
  let message = "Something went wrong.";
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapping = PRISMA_ERRORS.find((e) => e.code === err.code);
    if (mapping) {
      statusCode = mapping.status;
      message = mapping.message;
    }
  } else if (err instanceof SyntaxError) {
    statusCode = 400;
    message = "Invalid JSON payload";
  }

  if ((env.NODE_ENV === "development" || env.NODE_ENV === "test") && statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  const payload: Record<string, unknown> = {
    success: false,
    message
  };
  if (details !== undefined) {
    payload.errors = details;
  }
  if (env.NODE_ENV === "development" && statusCode >= 500 && err instanceof Error) {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
};
