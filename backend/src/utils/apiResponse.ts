import { Response } from "express";

export function success(
  res: Response,
  status: number,
  message: string,
  data?: unknown
): void {
  res.status(status).json({
    success: true,
    message,
    ...(data !== undefined ? { data } : {})
  });
}

export function fail(
  res: Response,
  status: number,
  message: string,
  details?: unknown
): void {
  res.status(status).json({
    success: false,
    message,
    ...(details !== undefined ? { errors: details } : {})
  });
}
