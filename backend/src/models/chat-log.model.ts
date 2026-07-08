import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatLog extends Document {
  userId: string;
  sessionId: string;
  question: string;
  answer: string;
  sources: Array<{ title: string; url: string; score: number }>;
  chunksRetrieved: number;
  topScore: number;
  responseTimeMs: number;
  fallback: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chatLogSchema = new Schema<IChatLog>(
  {
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    sources: [
      {
        title: { type: String },
        url: { type: String },
        score: { type: Number },
      },
    ],
    chunksRetrieved: { type: Number, default: 0 },
    topScore: { type: Number, default: 0 },
    responseTimeMs: { type: Number, default: 0 },
    fallback: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// TTL index: auto-delete logs older than 90 days
chatLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const ChatLog: Model<IChatLog> =
  mongoose.models.ChatLog || mongoose.model<IChatLog>("ChatLog", chatLogSchema);

export default ChatLog;
