import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAgentPhase {
  phaseIndex: number;
  name: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  errorMessage?: string;
  manualSteps?: string[];
}

export interface IAIAgentTask extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId: string;
  taskType: "create_item" | "document_workflow" | "item_analysis" | "data_export" | "report_generation";
  status: "pending" | "in_progress" | "completed" | "failed" | "partial";
  title: string;
  description: string;
  phases: IAgentPhase[];
  input?: any;
  output?: any;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const agentPhaseSchema = new Schema<IAgentPhase>(
  {
    phaseIndex: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "failed", "skipped"],
      default: "pending",
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    result: { type: Schema.Types.Mixed },
    errorMessage: { type: String },
    manualSteps: { type: [String], default: [] },
  },
  { _id: false }
);

const aiAgentTaskSchema = new Schema<IAIAgentTask>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: String, required: true, index: true },
    taskType: {
      type: String,
      enum: ["create_item", "document_workflow", "item_analysis", "data_export", "report_generation"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "failed", "partial"],
      default: "pending",
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    phases: { type: [agentPhaseSchema], default: [] },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

aiAgentTaskSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

const AIAgentTask: Model<IAIAgentTask> =
  mongoose.models.AIAgentTask || mongoose.model<IAIAgentTask>("AIAgentTask", aiAgentTaskSchema);

export default AIAgentTask;
