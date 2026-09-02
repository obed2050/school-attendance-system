import { Router } from "express";
import { listDepartmentsHandler } from "../controllers/department.controller";

const router = Router();

router.get("/", listDepartmentsHandler);

export default router;
