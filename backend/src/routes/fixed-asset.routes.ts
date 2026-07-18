import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as ctrl from "../controllers/fixed-asset.controller";

const router = Router();

router.use(authenticate);

router.get("/types", ctrl.listTypes);
router.post("/types", ctrl.createType);
router.patch("/types/:typeId", ctrl.updateType);
router.delete("/types/:typeId", ctrl.removeType);

router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.post("/", ctrl.create);
router.post("/:id/comments", ctrl.addComment);
router.post("/:id/depreciation", ctrl.postDepreciation);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

export default router;
