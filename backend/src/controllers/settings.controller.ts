import { Response } from "express";
import { getOrCreateSettings, updateSettings } from "../services/settings.service";
import { success } from "../utils/apiResponse";
import { catchAsync } from "../utils/catchAsync";

export const getSettingsHandler = catchAsync(async (_req, res: Response) => {
  const settings = await getOrCreateSettings();
  success(res, 200, "School settings retrieved", { settings });
});

export const updateSettingsHandler = catchAsync(async (req, res: Response) => {
  const settings = await updateSettings(req.body);
  success(res, 200, "School settings updated", { settings });
});