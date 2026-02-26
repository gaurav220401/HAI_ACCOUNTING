import { Schema } from "mongoose";
import { DocStatus } from "../types";

/**
 * Mongoose plugin: Document status workflow.
 * Adds docstatus field (0=Draft, 1=Submitted, 2=Cancelled).
 * Enforces valid state transitions: Draft→Submitted→Cancelled
 */
export function docStatusPlugin(schema: Schema): void {
  schema.add({
    docstatus: {
      type: Number,
      enum: [DocStatus.Draft, DocStatus.Submitted, DocStatus.Cancelled],
      default: DocStatus.Draft,
      index: true,
    },
    submittedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    amendedFrom: { type: Schema.Types.ObjectId, default: null },
  });

  schema.pre("save", function (next: any) {
    if (this.isModified("docstatus")) {
      const oldStatus = (this as any)._previousDocstatus ?? DocStatus.Draft;
      const newStatus = this.get("docstatus") as number;

      // Valid transitions: Draft(0)→Submitted(1), Submitted(1)→Cancelled(2)
      const validTransitions: { [key: number]: number[] } = {
        0: [1], // Draft → Submitted
        1: [2], // Submitted → Cancelled
        2: [], // Cancelled → nothing
      };

      if (!validTransitions[oldStatus]?.includes(newStatus)) {
        return next(
          new Error(
            `Invalid status transition: ${oldStatus} → ${newStatus}. ` +
              `Allowed: Draft(0)→Submitted(1)→Cancelled(2)`,
          ),
        );
      }

      if (newStatus === DocStatus.Submitted) {
        this.set("submittedAt", new Date());
      } else if (newStatus === DocStatus.Cancelled) {
        this.set("cancelledAt", new Date());
      }
    }
    next();
  });

  (schema as any).post("init", function (this: any) {
    this._previousDocstatus = this.get("docstatus");
  });

  // Convenience methods
  schema.method("submit", async function () {
    this.set("docstatus", DocStatus.Submitted);
    return this.save();
  });

  schema.method("cancel", async function () {
    this.set("docstatus", DocStatus.Cancelled);
    return this.save();
  });

  schema.method("isDraft", function (): boolean {
    return this.get("docstatus") === DocStatus.Draft;
  });

  schema.method("isSubmitted", function (): boolean {
    return this.get("docstatus") === DocStatus.Submitted;
  });

  schema.method("isCancelled", function (): boolean {
    return this.get("docstatus") === DocStatus.Cancelled;
  });
}
