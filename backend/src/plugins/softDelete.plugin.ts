import { Schema } from "mongoose";

/**
 * Mongoose plugin: Soft delete support.
 * Adds isDeleted, deletedAt, deletedBy fields.
 * Automatically filters out soft-deleted documents from all find queries.
 */
export function softDeletePlugin(schema: Schema): void {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  });

  // Auto-filter deleted documents from find queries
  function applyDeleteFilter(this: any, next: any) {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
    next();
  }

  (schema as any).pre("find", applyDeleteFilter);
  (schema as any).pre("findOne", applyDeleteFilter);
  (schema as any).pre("findOneAndUpdate", applyDeleteFilter);
  (schema as any).pre("countDocuments", applyDeleteFilter);

  // Add softDelete method to documents
  schema.methods.softDelete = async function (userId?: string) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    if (userId) this.deletedBy = userId;
    return this.save();
  };

  // Add restore method
  schema.methods.restore = async function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };
}
