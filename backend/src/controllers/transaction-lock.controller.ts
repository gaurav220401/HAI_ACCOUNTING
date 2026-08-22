import { Response } from "express";
import TransactionLock, { TRANSACTION_LOCK_MODULES } from "../models/transaction-lock.model";
import { AuthenticatedRequest, TransactionLockModule } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, ValidationError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function requireValidModule(value: unknown): TransactionLockModule {
  const module = String(value || "");
  if (!(TRANSACTION_LOCK_MODULES as string[]).includes(module)) {
    throw new ValidationError(
      `module must be one of: ${TRANSACTION_LOCK_MODULES.join(", ")}`,
    );
  }
  return module as TransactionLockModule;
}

function serialize(lock: { module: TransactionLockModule; isLocked: boolean; lockedDate: Date | null }) {
  return {
    module: lock.module,
    locked: lock.isLocked,
    lockedDate: lock.lockedDate,
  };
}

/** GET /api/transaction-locks */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  // Create any missing rows (isLocked: false) so the frontend always gets a
  // full, consistent list of all 4 modules, even on a brand-new organization.
  await Promise.all(
    TRANSACTION_LOCK_MODULES.map((module) =>
      TransactionLock.findOneAndUpdate(
        { organizationId, module },
        { $setOnInsert: { organizationId, module, isLocked: false, lockedDate: null } },
        { upsert: true, new: true },
      ),
    ),
  );

  const rows = await TransactionLock.find({ organizationId }).lean();
  const byModule = new Map(rows.map((row) => [row.module, row]));

  const data = TRANSACTION_LOCK_MODULES.map((module) =>
    serialize({
      module,
      isLocked: byModule.get(module)?.isLocked ?? false,
      lockedDate: byModule.get(module)?.lockedDate ?? null,
    }),
  );

  res.json({ success: true, data });
});

/** PUT /api/transaction-locks/:module — body: { lockedDate: string } */
export const setLock = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const module = requireValidModule(req.params.module);

  if (!req.body?.lockedDate) throw new ValidationError("lockedDate is required");
  const lockedDate = new Date(req.body.lockedDate);
  if (Number.isNaN(lockedDate.getTime())) {
    throw new ValidationError("lockedDate is not a valid date");
  }

  let lock = await TransactionLock.findOne({ organizationId, module });
  if (!lock) {
    lock = new TransactionLock({ organizationId, module });
  }
  lock.isLocked = true;
  lock.lockedDate = lockedDate;
  attachUser(lock as any, req);
  await lock.save();

  res.json({ success: true, data: serialize(lock) });
});

/** DELETE /api/transaction-locks/:module — unlocks the module entirely */
export const unlock = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const module = requireValidModule(req.params.module);

  let lock = await TransactionLock.findOne({ organizationId, module });
  if (!lock) {
    lock = new TransactionLock({ organizationId, module });
  }
  lock.isLocked = false;
  lock.lockedDate = null;
  attachUser(lock as any, req);
  await lock.save();

  res.json({ success: true, data: serialize(lock) });
});
