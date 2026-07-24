import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middlewares/auth";
import { handleChat, getAvailableModels } from "../controllers/chat.controller";

const router = Router();

// GET /api/chat/models — List available chat models
router.get("/models", authenticate, getAvailableModels as any);

// Stricter rate limit for chat endpoint — 20 requests per minute per user
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: any) => {
    // Rate limit per authenticated user, falling back to IP
    return req.user?._id?.toString() || req.firebaseUser?.uid || req.ip || "unknown";
  },
  message: {
    success: false,
    message: "Too many questions. Please wait a moment before asking again.",
  },
});

// POST /api/chat — Send a question to the RAG chatbot
router.post("/", authenticate, chatRateLimit, handleChat as any);

export default router;
