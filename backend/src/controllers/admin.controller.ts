import { Response } from "express";
import {
  listPendingUsers,
  approveUser,
  rejectUser,
  resetFaceReferenceByAdmin
} from "../services/auth.service";
import { listDevicesForUser, revokeDevice } from "../services/device.service";
import {
  listAdminAttendance,
  getDashboardStats,
  getAttendanceRecordsForExport,
  AdminAttendanceQuery,
  AttendanceExportQuery
} from "../services/attendance.service";
import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword
} from "../services/admin.service";
import { UserListQuery } from "../validators/admin";
import {
  buildAttendanceExportData,
  buildAttendancePdfBuffer,
  buildAttendanceExcelBuffer
} from "../services/report.service";
import { success } from "../utils/apiResponse";
import { ApiError } from "../utils/ApiError";
import { catchAsync } from "../utils/catchAsync";

function parseUserId(raw: string | undefined): number {
  const userId = parseInt(raw ?? "", 10);
  if (Number.isNaN(userId)) {
    throw new ApiError(400, "Invalid user id");
  }
  return userId;
}

export const listPendingUsersHandler = catchAsync(async (_req, res: Response) => {
  const users = await listPendingUsers();
  success(res, 200, "Pending users retrieved", { users });
});

export const approveUserHandler = catchAsync(async (req, res: Response) => {
  const userId = parseUserId(req.params.id);
  const user = await approveUser(userId);
  success(res, 200, "User approved successfully", { user });
});

export const rejectUserHandler = catchAsync(async (req, res: Response) => {
  const userId = parseUserId(req.params.id);
  const user = await rejectUser(userId);
  success(res, 200, "User rejected", { user });
});

export const listUserDevicesHandler = catchAsync(async (req, res: Response) => {
  const userId = parseUserId(req.params.id);
  const devices = await listDevicesForUser(userId);
  success(res, 200, "User devices retrieved", { devices });
});

export const revokeDeviceHandler = catchAsync(async (req, res: Response) => {
  const userId = parseUserId(req.params.id);
  const deviceId = parseInt(req.params.deviceId, 10);
  if (Number.isNaN(deviceId)) {
    throw new ApiError(400, "Invalid device id");
  }
  await revokeDevice(userId, deviceId);
  success(res, 200, "Device revoked successfully");
});

export const resetFaceReferenceHandler = catchAsync(
  async (req, res: Response) => {
    const userId = parseUserId(req.params.id);
    const user = await resetFaceReferenceByAdmin(req.user!.id, userId);
    success(res, 200, "Face profile reset. The staff member must re-enroll.", {
      user
    });
  }
);

export const listUsersHandler = catchAsync(async (req, res: Response) => {
  const query: UserListQuery = {
    search: req.query.search as string | undefined,
    role: req.query.role as "STAFF" | "ADMIN" | undefined,
    status: req.query.status as "PENDING" | "ACTIVE" | "REJECTED" | undefined,
    department: req.query.department ? Number(req.query.department) : undefined,
    page: Number(req.query.page ?? 1),
    limit: Number(req.query.limit ?? 10)
  };
  const result = await listUsers(query);
  success(res, 200, "Users retrieved", result);
});

export const createUserHandler = catchAsync(async (req, res: Response) => {
  const user = await createUser(req.body);
  success(res, 201, "User created successfully", { user });
});

export const updateUserHandler = catchAsync(async (req, res: Response) => {
  const userId = parseUserId(req.params.id);
  const user = await updateUser(userId, req.body);
  success(res, 200, "User updated successfully", { user });
});

export const resetPasswordHandler = catchAsync(async (req, res: Response) => {
  const userId = parseUserId(req.params.id);
  await resetUserPassword(userId, req.body);
  success(res, 200, "User password reset successfully");
});

export const listAttendanceHandler = catchAsync(async (req, res: Response) => {
  const query: AdminAttendanceQuery = {
    ...req.query,
    page: Number(req.query.page ?? 1),
    limit: Number(req.query.limit ?? 10)
  };
  const result = await listAdminAttendance(query);
  success(res, 200, "Attendance records retrieved", result);
});

export const dashboardStatsHandler = catchAsync(async (req, res: Response) => {
  const stats = await getDashboardStats(req.query.date as string | undefined);
  success(res, 200, "Dashboard statistics retrieved", stats);
});

export const exportAttendanceJsonHandler = catchAsync(
  async (req, res: Response) => {
    const exportQuery: AttendanceExportQuery = {
      date: req.query.date as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      department: req.query.department
        ? Number(req.query.department)
        : undefined,
      status: req.query.status as "PRESENT" | "LATE" | undefined,
      search: req.query.search as string | undefined
    };
    const records = await getAttendanceRecordsForExport(exportQuery);
    success(res, 200, "Export data retrieved", { records });
  }
);

export const exportAttendancePdfHandler = catchAsync(
  async (req, res: Response) => {
    const exportQuery: AttendanceExportQuery = {
      date: req.query.date as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      department: req.query.department
        ? Number(req.query.department)
        : undefined,
      status: req.query.status as "PRESENT" | "LATE" | undefined,
      search: req.query.search as string | undefined
    };
    const data = await buildAttendanceExportData(exportQuery);
    const buffer = await buildAttendancePdfBuffer(data);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="attendance-report.pdf"'
    );
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  }
);

export const exportAttendanceExcelHandler = catchAsync(
  async (req, res: Response) => {
    const exportQuery: AttendanceExportQuery = {
      date: req.query.date as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      department: req.query.department
        ? Number(req.query.department)
        : undefined,
      status: req.query.status as "PRESENT" | "LATE" | undefined,
      search: req.query.search as string | undefined
    };
    const data = await buildAttendanceExportData(exportQuery);
    const buffer = await buildAttendanceExcelBuffer(data);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="attendance-report.xlsx"'
    );
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  }
);