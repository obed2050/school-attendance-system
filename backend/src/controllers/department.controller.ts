import { Response } from "express";
import { listPublicDepartments, listAllDepartments } from "../services/department.service";
import { success } from "../utils/apiResponse";
import { catchAsync } from "../utils/catchAsync";

export const listDepartmentsHandler = catchAsync(async (_req, res: Response) => {
  const departments = await listPublicDepartments();
  success(res, 200, "Departments retrieved", { departments });
});

export const listAllDepartmentsHandler = catchAsync(async (_req, res: Response) => {
  const departments = await listAllDepartments();
  success(res, 200, "Departments retrieved", { departments });
});
