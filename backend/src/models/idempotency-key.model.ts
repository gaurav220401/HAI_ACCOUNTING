import { Document, Schema, Types, model } from "mongoose";

export interface IIdempotencyKey extends Document {
  organization_id: Types.ObjectId;
  scope: string;
  key: string;
  expires_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const idempotencyKeySchema = new Schema<IIdempotencyKey>(
  {
    organization_id: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    scope: { type: String, required: true },
    key: { type: String, required: true },
    expires_at: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

idempotencyKeySchema.index({ organization_id: 1, scope: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const IdempotencyKey = model<IIdempotencyKey>("IdempotencyKey", idempotencyKeySchema);
export default IdempotencyKey;
