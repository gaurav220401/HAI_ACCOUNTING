import { Router } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import organizationRoutes from "./organization.routes";
import roleRoutes from "./role.routes";
import accountRoutes from "./account.routes";
import contactRoutes from "./contact.routes";
import itemRoutes from "./item.routes";
import currencyRoutes from "./currency.routes";
import settingsRoutes from "./settings.routes";
import quoteRoutes from "./quote.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/organizations", organizationRoutes);
router.use("/roles", roleRoutes);
router.use("/accounts", accountRoutes);
router.use("/contacts", contactRoutes);
router.use("/items", itemRoutes);
router.use("/currencies", currencyRoutes);
router.use("/settings", settingsRoutes);
router.use("/quotes", quoteRoutes);

export default router;
