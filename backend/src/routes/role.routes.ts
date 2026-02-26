import { Router } from "express";
import * as roleController from "../controllers/role.controller";
import { authenticate, requireRole } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { createRoleSchema } from "../validators";

const router = Router();

router.use(authenticate);
router.use(requireRole("System Manager"));

router.get("/", roleController.list);
router.get("/:id", roleController.getById);
router.post("/", validate(createRoleSchema), roleController.create);
router.put("/:id", roleController.update);
router.delete("/:id", roleController.remove);

export default router;
