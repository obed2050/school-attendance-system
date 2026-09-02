import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { success } from "../utils/apiResponse";

export const healthHandler = async (_req: Request, res: Response) => {
  let dbStatus: "up" | "down" = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "down";
  }

  success(res, 200, "OK", {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: dbStatus
  });
};