import { Router } from "express";
import {
  listPendingUsersHandler,
  approveUserHandler,
  rejectUserHandler,
  listUsersHandler,
  createUserHandler,
  updateUserHandler,
  resetPasswordHandler,
  listAttendanceHandler,
  dashboardStatsHandler,
  exportAttendanceJsonHandler,
  exportAttendancePdfHandler,
  exportAttendanceExcelHandler,
  listUserDevicesHandler,
  revokeDeviceHandler,
  resetFaceReferenceHandler
} from "../controllers/admin.controller";
import { listAllDepartmentsHandler } from "../controllers/department.controller";
import {
  getSettingsHandler,
  updateSettingsHandler
} from "../controllers/settings.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { validate } from "../middleware/validate";
import { attendanceQuerySchema } from "../validators/attendance";
import { updateSettingsSchema } from "../validators/settings";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  userListQuerySchema
} from "../validators/admin";

const router = Router();

// Every admin route requires authentication + the ADMIN role.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/departments", listAllDepartmentsHandler);

// School settings (singleton row)
router.get("/settings", getSettingsHandler);
router.put("/settings", validate(updateSettingsSchema), updateSettingsHandler);

// User management
router.get("/users", validate(userListQuerySchema, "query"), listUsersHandler);
router.post("/users", validate(createUserSchema), createUserHandler);
router.patch("/users/:id", validate(updateUserSchema), updateUserHandler);
router.post(
  "/users/:id/reset-password",
  validate(resetPasswordSchema),
  resetPasswordHandler
);
router.get("/pending-users", listPendingUsersHandler);
router.patch("/users/:id/approve", approveUserHandler);
router.patch("/users/:id/reject", rejectUserHandler);

// Device & biometric management
router.get("/users/:id/devices", listUserDevicesHandler);
router.post("/users/:id/devices/:deviceId/revoke", revokeDeviceHandler);
router.post("/users/:id/face-reference/reset", resetFaceReferenceHandler);

// Attendance
router.get(
  "/attendance",
  validate(attendanceQuerySchema, "query"),
  listAttendanceHandler
);
router.get(
  "/attendance/export",
  validate(attendanceQuerySchema, "query"),
  exportAttendanceJsonHandler
);
router.get(
  "/reports/attendance/pdf",
  validate(attendanceQuerySchema, "query"),
  exportAttendancePdfHandler
);
router.get(
  "/reports/attendance/excel",
  validate(attendanceQuerySchema, "query"),
  exportAttendanceExcelHandler
);

// Dashboard
router.get("/dashboard/stats", dashboardStatsHandler);

export default router;