import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  listSessions,
  createSession,
  getSession,
  appendMessage,
  deleteSession,
} from "../controllers/chat-session.controller";

const router = Router();

// Secure all endpoints under chat sessions route
router.get("/", authenticate, listSessions);
router.post("/", authenticate, createSession);
router.get("/:id", authenticate, getSession);
router.patch("/:id/append", authenticate, appendMessage);
router.delete("/:id", authenticate, deleteSession);

export default router;
