import { Router } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import organizationRoutes from "./organization.routes";
import roleRoutes from "./role.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/organizations", organizationRoutes);
router.use("/roles", roleRoutes);

export default router;
