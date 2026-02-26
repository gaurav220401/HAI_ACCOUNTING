import { Router } from "express";
import * as companyController from "../controllers/company.controller";
import { authenticate, requireRole } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { createCompanySchema, updateCompanySchema } from "../validators";

const router = Router();

router.use(authenticate);

router.post("/", validate(createCompanySchema), companyController.create);
router.get("/", companyController.list);
router.get("/:id", companyController.getById);
router.put("/:id", validate(updateCompanySchema), companyController.update);
router.delete("/:id", requireRole("System Manager"), companyController.remove);
router.put("/:id/set-active", companyController.setActive);

export default router;
