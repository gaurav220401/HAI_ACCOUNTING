import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin } from "../plugins";

export interface IDocumentMailbox extends Document {
  organizationId: Types.ObjectId;
  mailboxAddress: string;
  mailboxToken: string;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const documentMailboxSchema = new Schema<IDocumentMailbox>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },
    mailboxAddress: { type: String, required: true, unique: true, index: true },
    mailboxToken: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

documentMailboxSchema.plugin(auditTrailPlugin);

const DocumentMailbox = model<IDocumentMailbox>("DocumentMailbox", documentMailboxSchema);
export default DocumentMailbox;
