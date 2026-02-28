import { Schema } from "mongoose";

/**
 * organizationScopedPlugin
 *
 * Adds an `organizationId` field to any schema, scoping the document to an
 * Organization.  Every document that belongs to an org MUST include this field.
 *
 * Usage:
 *   schema.plugin(organizationScopedPlugin);
 */
export function organizationScopedPlugin(schema: Schema): void {
  schema.add({
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
  });
}
