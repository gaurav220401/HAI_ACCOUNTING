import { Schema } from "mongoose";
import { AuthenticatedRequest } from "../types";

/**
 * Mongoose plugin: Adds createdBy / updatedBy fields that auto-populate
 * from the authenticated user on save.
 */
export function auditTrailPlugin(schema: Schema): void {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  });

  // Use a pre-save hook; the controller must set `doc.$locals.userId`
  schema.pre("save", function () {
    const userId = (this as any).$locals?.userId;
    if (userId) {
      if (this.isNew) {
        this.set("createdBy", userId);
      }
      this.set("updatedBy", userId);
    }
  });
}

/**
 * Helper: Attach userId to a document before saving.
 * Usage in controllers: attachUser(doc, req);  doc.save();
 */
export function attachUser(doc: any, req: AuthenticatedRequest): void {
  if (req.user?._id) {
    doc.$locals = doc.$locals || {};
    doc.$locals.userId = req.user._id;
  }
}
