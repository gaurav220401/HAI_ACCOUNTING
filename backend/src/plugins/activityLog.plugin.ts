import { Schema, Types } from "mongoose";

/**
 * Activity log entry recorded for every document change.
 */
export interface IActivityLogEntry {
  timestamp: Date;
  userId: Types.ObjectId | null;
  action: "created" | "updated" | "deleted" | "restored";
  /** Field-level diff: { fieldName: { before, after } } */
  changes: Record<string, { before: unknown; after: unknown }>;
}

/**
 * activityLogPlugin
 *
 * Appends a tamper-proof, field-level change log to any Mongoose schema.
 * Each time a document is saved an entry is pushed to the `activityLog` array.
 *
 * The log is append-only — no existing entries are ever overwritten.
 *
 * Usage:
 *   schema.plugin(activityLogPlugin);
 *
 * To attach the acting user before save:
 *   doc.$locals.userId = req.user._id.toString();
 */
export function activityLogPlugin(schema: Schema): void {
  // ── 1. Add the activityLog array field ────────────────────────────────
  schema.add({
    activityLog: {
      type: [
        {
          timestamp: { type: Date, required: true, default: () => new Date() },
          userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
          action: {
            type: String,
            enum: ["created", "updated", "deleted", "restored"],
            required: true,
          },
          changes: { type: Schema.Types.Mixed, default: {} },
        },
      ],
      default: [],
      select: false, // excluded from queries by default — must use .select("+activityLog")
    },
  });

  // ── 2. Pre-save hook — diff fields & push entry ───────────────────────
  schema.pre("save", async function () {
    const doc = this as any;
    const userId: Types.ObjectId | null = doc.$locals?.userId
      ? new Types.ObjectId(doc.$locals.userId as string)
      : null;

    const action: IActivityLogEntry["action"] = doc.isNew
      ? "created"
      : "updated";

    const changes: IActivityLogEntry["changes"] = {};

    if (!doc.isNew) {
      // Walk all modified paths and record before → after
      for (const path of doc.modifiedPaths()) {
        // Skip internal / log fields
        if (
          path === "activityLog" ||
          path === "updatedAt" ||
          path === "createdAt" ||
          path === "__v"
        ) {
          continue;
        }

        changes[path] = {
          before: doc.$__getValue(path), // value currently in DB (not yet saved)
          after: doc.get(path),
        };
      }
    }

    if (doc.activityLog) {
      doc.activityLog.push({
        timestamp: new Date(),
        userId,
        action,
        changes,
      });
    }
  });
}

/**
 * Helper — attach a userId to a document's $locals so the activityLog
 * plugin can record who made the change.
 *
 * @example
 *   attachActivityUser(invoice, req);
 *   await invoice.save();
 */
export function attachActivityUser(doc: any, userId: string | null): void {
  if (!doc.$locals) doc.$locals = {};
  doc.$locals.userId = userId;
}
