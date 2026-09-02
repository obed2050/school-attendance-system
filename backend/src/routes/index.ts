import { Router } from "express";
import authRoutes from "./auth.routes";
import departmentRoutes from "./department.routes";
import attendanceRoutes from "./attendance.routes";
import adminRoutes from "./admin.routes";
import configRoutes from "./config.routes";
import { healthHandler } from "../controllers/health.controller";

const router = Router();

router.get("/api/health", healthHandler);

router.use("/api/auth", authRoutes);
router.use("/api/departments", departmentRoutes);
router.use("/api/attendance", attendanceRoutes);
router.use("/api/admin", adminRoutes);
router.use("/api/config", configRoutes);

export default router;
