import { ClientSession, Types } from "mongoose";
import IdempotencyKey from "../models/idempotency-key.model";
import { AuthenticatedRequest } from "../types";
import { ConflictError, ValidationError } from "./errors";

function readIdempotencyKey(req: AuthenticatedRequest): string | null {
  const headerKey = req.header("idempotency-key") || req.header("Idempotency-Key");
  const bodyKey = req.body?.idempotency_key || req.body?.idempotencyKey;
  const raw = String(headerKey || bodyKey || "").trim();

  if (!raw) return null;
  if (raw.length > 120) {
    throw new ValidationError("idempotency key is too long");
  }

  return raw;
}

export async function reserveIdempotencyKey(params: {
  req: AuthenticatedRequest;
  organization_id: Types.ObjectId;
  scope: string;
  session?: ClientSession;
}): Promise<void> {
  const key = readIdempotencyKey(params.req);
  if (!key) return;

  try {
    const result = await IdempotencyKey.updateOne(
      {
        organization_id: params.organization_id,
        scope: params.scope,
        key,
      },
      {
        $setOnInsert: {
          organization_id: params.organization_id,
          scope: params.scope,
          key,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      {
        upsert: true,
        session: params.session,
      },
    );

    if (result.matchedCount > 0 && result.upsertedCount === 0) {
      throw new ConflictError("Duplicate request detected. This operation was already processed.");
    }
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new ConflictError("Duplicate request detected. This operation was already processed.");
    }
    throw error;
  }
}
