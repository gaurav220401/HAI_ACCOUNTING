import { Router } from "express";
import * as categorizationRuleController from "../controllers/categorization-rule.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.use(authenticate);

router.get("/", categorizationRuleController.list);
router.patch("/:id", categorizationRuleController.update);
router.delete("/:id", categorizationRuleController.remove);

export default router;
