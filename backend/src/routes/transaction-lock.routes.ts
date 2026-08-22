import { Router } from "express";
import * as transactionLockController from "../controllers/transaction-lock.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.use(authenticate);

router.get("/", transactionLockController.list);
router.put("/:module", transactionLockController.setLock);
router.delete("/:module", transactionLockController.unlock);

export default router;
