import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  listTasks,
  getTask,
  createItemWorkflow,
  salesToPaymentWorkflow,
  analyzeItems,
  askAgentQuestion,
} from "../controllers/ai-agent.controller";

const router = Router();

// Secure all endpoints under AI Agent route prefix
router.get("/tasks", authenticate, listTasks);
router.get("/tasks/:id", authenticate, getTask);
router.post("/workflow/create-item", authenticate, createItemWorkflow);
router.post("/workflow/sales-to-payment", authenticate, salesToPaymentWorkflow);
router.get("/items/analysis", authenticate, analyzeItems);
router.post("/ask", authenticate, askAgentQuestion);

export default router;
