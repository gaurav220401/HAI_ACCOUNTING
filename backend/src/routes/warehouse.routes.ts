import { Router } from "express";
import * as warehouseController from "../controllers/warehouse.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.use(authenticate);

router.get("/", warehouseController.list);

export default router;
