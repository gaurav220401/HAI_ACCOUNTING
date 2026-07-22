import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as MoveOrderController from "../controllers/move-order.controller";

const router = Router();
router.use(authenticate);

router.get("/", MoveOrderController.list);
router.get("/:id", MoveOrderController.getOne);
router.post("/", MoveOrderController.create);
router.put("/:id", MoveOrderController.update);
router.post("/:id/status", MoveOrderController.updateStatus);
router.patch("/:id/status", MoveOrderController.updateStatus);
router.delete("/:id", MoveOrderController.remove);

export default router;
