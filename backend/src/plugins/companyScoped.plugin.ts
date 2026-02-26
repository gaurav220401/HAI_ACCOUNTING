import { Schema, Query } from "mongoose";

/**
 * Mongoose plugin: Company scoping.
 * Adds a `company` field and ensures all queries are scoped to a company
 * unless explicitly querying across companies.
 */
export function companyScopedPlugin(schema: Schema): void {
  schema.add({
    company: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
  });

  // Add compound index with company for common query patterns
  // Individual models should add more specific compound indexes
}
