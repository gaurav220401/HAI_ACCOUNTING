import { Router } from "express";
import * as ctrl from "../controllers/recurring-bill.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();
router.use(authenticate);

router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.get("/:id/bills", ctrl.getGeneratedBills);
router.post("/", ctrl.create);
router.patch("/:id", ctrl.update);
router.post("/:id/stop", ctrl.stop);
router.post("/:id/resume", ctrl.resume);
router.post("/:id/create-bill", ctrl.createBillNow);
router.delete("/:id", ctrl.remove);

export default router;
