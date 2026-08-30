import { Response } from "express";
import CategorizationRule from "../models/categorization-rule.model";
import Account from "../models/account.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

/**
 * GET /api/categorization-rules — every learned counterparty→account mapping
 * for this org, most recently applied first. This is the only place a user
 * can see (and correct) what bank-statement.service.ts has silently taught
 * itself — see learnCategorizationRule() there for where rows are written.
 */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  const rules = await CategorizationRule.find({ organizationId })
    .sort({ lastAppliedAt: -1 })
    .populate("accountId", "name")
    .populate("contactId", "displayName")
    .lean();

  const data = rules.map((rule) => ({
    _id: String(rule._id),
    matchType: rule.matchType,
    matchValue: rule.matchValue,
    accountId: rule.accountId ? String((rule.accountId as any)._id) : null,
    accountName: (rule.accountId as any)?.name || "",
    contactName: (rule.contactId as any)?.displayName || null,
    timesApplied: rule.timesApplied,
    lastAppliedAt: rule.lastAppliedAt,
  }));

  res.json({ success: true, data });
});

/** PATCH /api/categorization-rules/:id — body: { accountId } */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const { accountId } = req.body || {};
  if (!accountId) throw new ValidationError("accountId is required");

  const account = await Account.findOne({ _id: accountId, organizationId, isDeleted: false });
  if (!account) throw new ValidationError("That account doesn't exist");

  const rule = await CategorizationRule.findOne({ _id: req.params.id, organizationId });
  if (!rule) throw new NotFoundError("Rule not found");

  rule.accountId = account._id;
  attachUser(rule as any, req);
  await rule.save();

  res.json({
    success: true,
    data: { _id: String(rule._id), accountId: String(rule.accountId), accountName: account.name },
  });
});

/** DELETE /api/categorization-rules/:id — the counterparty reverts to Suspense until re-taught. */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const rule = await CategorizationRule.findOneAndDelete({ _id: req.params.id, organizationId });
  if (!rule) throw new NotFoundError("Rule not found");
  res.json({ success: true, data: { _id: String(rule._id) } });
});
