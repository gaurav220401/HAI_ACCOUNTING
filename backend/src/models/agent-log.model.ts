import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAgentToolExecution {
  toolName: string;
  args: Record<string, any>;
  status: "executing" | "completed" | "failed";
  result?: any;
  error?: string;
}

export interface IAgentLog extends Document {
  userId: string;
  organizationId?: mongoose.Types.ObjectId;
  sessionId: string;
  instruction: string;
  answer: string;
  toolSteps: IAgentToolExecution[];
  formAutofill?: {
    formType: string;
    data: Record<string, any>;
    navigationUrl?: string;
  };
  responseTimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const agentLogSchema = new Schema<IAgentLog>(
  {
    userId: { type: String, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    sessionId: { type: String, required: true, index: true },
    instruction: { type: String, required: true },
    answer: { type: String, required: true },
    toolSteps: [
      {
        toolName: { type: String, required: true },
        args: { type: Schema.Types.Mixed },
        status: { type: String, enum: ["executing", "completed", "failed"], default: "completed" },
        result: { type: Schema.Types.Mixed },
        error: { type: String },
      },
    ],
    formAutofill: {
      formType: { type: String },
      data: { type: Schema.Types.Mixed },
      navigationUrl: { type: String },
    },
    responseTimeMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// TTL index: auto-delete logs older than 90 days
agentLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const AgentLog: Model<IAgentLog> =
  mongoose.models.AgentLog || mongoose.model<IAgentLog>("AgentLog", agentLogSchema);

export default AgentLog;
