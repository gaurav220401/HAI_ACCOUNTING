import { Router } from "express";
import * as warehouseController from "../controllers/warehouse.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.use(authenticate);

router.get("/", warehouseController.list);
router.post("/", warehouseController.create);
router.get("/:id", warehouseController.getOne);
router.patch("/:id", warehouseController.update);
router.delete("/:id", warehouseController.remove);

export default router;
