import { Router } from "express";
import { handleAgentChat, getAgentHistory } from "../controllers/agent.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

/**
 * @route   POST /api/agent/chat
 * @desc    Execute natural language instruction using autonomous tool-calling AI agent
 * @access  Private / Authenticated
 */
router.post("/chat", authenticate, handleAgentChat);

/**
 * @route   GET /api/agent/history
 * @desc    Get execution logs for session
 * @access  Private / Authenticated
 */
router.get("/history", authenticate, getAgentHistory);

export default router;
