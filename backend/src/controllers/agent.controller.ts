import { Request, Response } from "express";
import mongoose from "mongoose";
import Organization from "../models/organization.model";
import AgentLog from "../models/agent-log.model";
import { runAgentWorkflow } from "../services/agent.service";

/**
 * Handle incoming natural language task requests for the AI Task Agent.
 */
export async function handleAgentChat(req: Request, res: Response) {
  const startTime = Date.now();

  try {
    const { instruction, sessionId: providedSessionId } = req.body;

    if (!instruction || typeof instruction !== "string" || !instruction.trim()) {
      return res.status(400).json({
        success: false,
        message: "Instruction text is required.",
      });
    }

    const trimmedInstruction = instruction.trim();

    // 1. Resolve Organization ID
    let organizationId: string | undefined =
      (req.headers?.["x-organization-id"] as string) ||
      (req as any).user?.activeOrganization?.toString() ||
      (req as any).user?.organizationId?.toString() ||
      (req as any).organizationId;

    if (!organizationId && (req as any).user) {
      const userObj = (req as any).user;
      const userOrg = await Organization.findOne({
        $or: [{ members: userObj._id }, { owner: userObj._id }],
        isDeleted: { $ne: true },
      }).lean();

      if (userOrg) {
        organizationId = userOrg._id.toString();
        userObj.activeOrganization = userOrg._id;
        await userObj.save().catch(() => {});
      }
    }

    if (!organizationId) {
      let defaultOrg = await Organization.findOne({ isActive: true, isDeleted: false })
        .sort({ createdAt: 1 })
        .lean();

      if (!defaultOrg) {
        defaultOrg = await Organization.findOne().lean();
      }

      if (defaultOrg) {
        organizationId = defaultOrg._id.toString();
      } else {
        return res.status(400).json({
          success: false,
          message: "No active organization found to run AI Agent task.",
        });
      }
    }

    const userId = (req as any).user?._id?.toString() || "system_user";
    const sessionId = providedSessionId || `agent_session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    console.log(`🤖 [AI Agent Instruction]: "${trimmedInstruction}" | Org: ${organizationId}`);

    // 2. Run Multi-turn Agent Workflow
    const agentResult = await runAgentWorkflow(trimmedInstruction, organizationId);

    const responseTimeMs = Date.now() - startTime;

    // 3. Log execution details to AgentLog schema
    try {
      await AgentLog.create({
        userId,
        organizationId: new mongoose.Types.ObjectId(organizationId),
        sessionId,
        instruction: trimmedInstruction,
        answer: agentResult.answer,
        toolSteps: agentResult.toolSteps,
        formAutofill: agentResult.formAutofill,
        responseTimeMs,
      });
    } catch (logErr) {
      console.warn("⚠️ Failed to write agent log record:", logErr);
    }

    return res.status(200).json({
      success: true,
      data: {
        answer: agentResult.answer,
        toolSteps: agentResult.toolSteps,
        formAutofill: agentResult.formAutofill,
        sessionId,
        responseTimeMs,
      },
    });
  } catch (error: any) {
    console.error("❌ [AI Agent Controller Error]:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to execute AI Agent task workflow.",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

/**
 * Get recent agent history for the current session/user.
 */
export async function getAgentHistory(req: Request, res: Response) {
  try {
    const { sessionId } = req.query;

    const filter: any = {};
    if (sessionId) filter.sessionId = sessionId;

    const logs = await AgentLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve agent execution history.",
    });
  }
}
