import { Response } from "express";
import ChatSession from "../models/chat-session.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../types";

// GET /api/chat-sessions - List sessions for active organization + user
export const listSessions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  const sessions = await ChatSession.find({ organizationId, userId })
    .select("-messages") // Exclude potentially large message payload for listing
    .sort({ lastActivity: -1 })
    .limit(20);

  res.json({ success: true, data: sessions });
});

// POST /api/chat-sessions - Create a new empty chat session
export const createSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
  const { title } = req.body;

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  const session = await ChatSession.create({
    organizationId,
    userId,
    title: title || "New Chat",
    messages: [],
    lastActivity: new Date(),
  });

  res.json({ success: true, data: session });
});

// GET /api/chat-sessions/:id - Retrieve a session with full message history
export const getSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
  const { id } = req.params;

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  const session = await ChatSession.findOne({ _id: id, organizationId, userId });

  if (!session) {
    res.status(404).json({ success: false, message: "Session not found." });
    return;
  }

  res.json({ success: true, data: session });
});

// PATCH /api/chat-sessions/:id/append - Append a single message (e.g. error, retry, or custom trigger)
export const appendMessage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
  const { id } = req.params;
  const { role, content, sources, isError } = req.body;

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  const session = await ChatSession.findOne({ _id: id, organizationId, userId });

  if (!session) {
    res.status(404).json({ success: false, message: "Session not found." });
    return;
  }

  session.messages.push({
    role,
    content,
    sources: sources || [],
    isError: isError || false,
    timestamp: new Date(),
  });
  session.lastActivity = new Date();

  // Auto-rename session on first user prompt
  if (session.title === "New Chat" && role === "user") {
    session.title = content.substring(0, 50);
  }

  await session.save();

  res.json({ success: true, data: session });
});

// DELETE /api/chat-sessions/:id - Remove a session and its message logs
export const deleteSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
  const { id } = req.params;

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  const session = await ChatSession.findOneAndDelete({ _id: id, organizationId, userId });

  if (!session) {
    res.status(404).json({ success: false, message: "Session not found." });
    return;
  }

  res.json({ success: true, message: "Session deleted successfully." });
});
