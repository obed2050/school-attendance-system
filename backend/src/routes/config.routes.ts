import { Router } from "express";
import {
  getAppConfigHandler,
  getSchoolQrHandler
} from "../controllers/config.controller";

const router = Router();

router.get("/", getAppConfigHandler);
router.get("/qr", getSchoolQrHandler);

export default router;