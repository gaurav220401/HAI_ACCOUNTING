import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  createPackage,
  listPackagesBySalesOrder,
  getPackage,
  deletePackage,
} from "../controllers/package.controller";

const router = Router();

router.use(authenticate);

router.post("/", createPackage);
router.get("/order/:orderId", listPackagesBySalesOrder);
router.get("/:id", getPackage);
router.delete("/:id", deletePackage);

export default router;
