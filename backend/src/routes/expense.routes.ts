import { Router } from "express";
import * as expenseController from "../controllers/expense.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.use(authenticate);

router.get("/", expenseController.list);
router.get("/:id", expenseController.getOne);
router.post("/", expenseController.create);
router.post("/bulk", expenseController.bulkCreate);
router.patch("/:id", expenseController.update);
router.delete("/:id", expenseController.remove);

export default router;
