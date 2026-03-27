import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type FolderVisibility = "all_users" | "custom";

export interface IDocumentFolderPermission {
  principalType: "user" | "role";
  principalId: string;
  accessLevel: "read" | "write";
}

export interface IDocumentFolder extends Document {
  organizationId: Types.ObjectId;
  name: string;
  visibilityType: FolderVisibility;
  permissions: IDocumentFolderPermission[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSchema = new Schema<IDocumentFolderPermission>(
  {
    principalType: { type: String, enum: ["user", "role"], required: true },
    principalId: { type: String, required: true },
    accessLevel: { type: String, enum: ["read", "write"], default: "read" },
  },
  { _id: false },
);

const documentFolderSchema = new Schema<IDocumentFolder>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    visibilityType: {
      type: String,
      enum: ["all_users", "custom"],
      default: "all_users",
    },
    permissions: { type: [permissionSchema], default: [] },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

documentFolderSchema.plugin(auditTrailPlugin);
documentFolderSchema.plugin(softDeletePlugin);
documentFolderSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const DocumentFolder = model<IDocumentFolder>("DocumentFolder", documentFolderSchema);
export default DocumentFolder;
