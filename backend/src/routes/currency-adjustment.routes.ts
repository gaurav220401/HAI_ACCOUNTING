import { Router } from "express";
import * as ctrl from "../controllers/currency-adjustment.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();
router.use(authenticate);

router.get("/",     ctrl.list);
router.get("/:id",  ctrl.getOne);
router.post("/",    ctrl.create);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

export default router;
