import { Response } from "express";
import Warehouse from "../models/warehouse.model";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const includeInactive = String(req.query.includeInactive || "false") === "true";
  const filter: any = {
    organizationId: orgId(req),
  };
  if (!includeInactive) {
    filter.isActive = true;
  }

  const data = await Warehouse.find({
    ...filter,
  }).sort({ name: 1 });
  res.json({ success: true, data });
});
