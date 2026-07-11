import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatSession extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId: string;
  title: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    sources?: Array<{ title: string; url: string }>;
    isError?: boolean;
    timestamp: Date;
  }>;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chatSessionSchema = new Schema<IChatSession>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    userId: { type: String, required: true },
    title: { type: String, default: "New Chat", maxlength: 80 },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        sources: [
          {
            title: { type: String },
            url: { type: String },
          },
        ],
        isError: { type: Boolean, default: false },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

chatSessionSchema.index({ organizationId: 1, userId: 1, lastActivity: -1 });

const ChatSession: Model<IChatSession> =
  mongoose.models.ChatSession || mongoose.model<IChatSession>("ChatSession", chatSessionSchema);

export default ChatSession;
