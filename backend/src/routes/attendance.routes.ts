import { Router } from "express";
import {
  submitAttendanceHandler,
  myAttendanceHandler,
  registerDeviceHandler,
  provisionDeviceHandler,
  deviceStatusHandler
} from "../controllers/attendance.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { validate } from "../middleware/validate";
import { attendanceSubmitSchema } from "../validators/attendance";

const router = Router();

router.use(requireAuth);

router.post("/", requireRole("STAFF"), validate(attendanceSubmitSchema), submitAttendanceHandler);
router.post("/device-register", requireRole("STAFF"), registerDeviceHandler);
router.post("/device", requireRole("STAFF"), provisionDeviceHandler);
router.get("/device", requireRole("STAFF"), deviceStatusHandler);
router.get("/me", requireRole("STAFF"), myAttendanceHandler);

export default router;