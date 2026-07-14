import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middlewares/auth";
import { handleChat, handleIngest } from "../controllers/chat.controller";

const router = Router();

// Stricter rate limit for chat endpoint — 20 requests per minute per user
// Key by user ID (not raw IP) to avoid express-rate-limit IPv6 validation errors.
// The authenticate middleware ensures req.user or req.firebaseUser is always present.
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // Always return a non-IP user-scoped key — safe from IPv6 validation issues
    const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
    return userId ?? "anon";
  },
  message: {
    success: false,
    message: "Too many questions. Please wait a moment before asking again.",
  },
});

// POST /api/chat — Send a question to the RAG chatbot
router.post("/", authenticate, chatRateLimit, handleChat as any);

// POST /api/chat/ingest — Trigger knowledge base sync manually
router.post("/ingest", authenticate, handleIngest as any);

export default router;
