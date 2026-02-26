import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { authenticate, requireRole } from "../middlewares/auth";
import { paginate } from "../middlewares/paginate";

const router = Router();

router.use(authenticate);

router.get("/", paginate, userController.list);
router.get("/:id", userController.getById);
router.put(
  "/:id/roles",
  requireRole("System Manager"),
  userController.assignRoles,
);

export default router;
