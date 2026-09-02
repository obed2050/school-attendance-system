import { Response } from "express";
import { getAppConfig } from "../services/config.service";
import { getOrCreateSettings } from "../services/settings.service";
import { env } from "../config/env";
import { success } from "../utils/apiResponse";
import { catchAsync } from "../utils/catchAsync";

export const getAppConfigHandler = catchAsync(async (_req, res: Response) => {
  const config = await getAppConfig();
  success(res, 200, "App configuration retrieved", config);
});

export const getSchoolQrHandler = catchAsync(async (_req, res: Response) => {
  const settings = await getOrCreateSettings();
  const attendanceUrl = new URL("/attendance", env.FRONTEND_URL || env.CLIENT_URL).toString();
  success(res, 200, "School QR entry retrieved", {
    school_name: settings.schoolName,
    attendance_url: attendanceUrl
  });
});