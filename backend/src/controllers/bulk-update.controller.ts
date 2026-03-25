import { Response } from "express";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, ValidationError } from "../utils/errors";
import mongoose from "mongoose";

import Invoice from "../models/invoice.model";
import Quote from "../models/quote.model";
import SalesOrder from "../models/sales-order.model";
import Expense from "../models/expense.model";
import DeliveryChallan from "../models/delivery-challan.model";

// ─── Simple in-memory history store ─────────────────────────────────────────
// We keep it in memory (reset on restart) rather than a DB model for simplicity.
// A production app would persist these to MongoDB.

interface BulkUpdateJob {
  id: string;
  organizationId: string;
  moduleType: string;
  oldAccountId: string;
  oldAccountName: string;
  newAccountId: string;
  newAccountName: string;
  transactionIds: string[];
  updatedCount: number;
  status: "Completed" | "Failed";
  performedAt: string;
}

const jobStore: BulkUpdateJob[] = [];

function orgId(req: AuthenticatedRequest): string {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id.toString();
}

// Map of supported module names → Mongoose models
const MODULE_MAP: Record<string, mongoose.Model<any>> = {
  Invoices: Invoice,
  Quotes: Quote,
  "Sales Orders": SalesOrder,
  Expenses: Expense,
  "Delivery Challans": DeliveryChallan,
};

// ─── Per-module schema metadata ──────────────────────────────────────────────

const MODULE_META: Record<
  string,
  {
    dateField: string;
    numberField: string;
    contactField: "customerId" | "vendorId" | "both";
    hasItemsAccountId: boolean;
    hasExpenseAccountId: boolean;
  }
> = {
  Invoices: {
    dateField: "invoiceDate",
    numberField: "invoiceNumber",
    contactField: "customerId",
    hasItemsAccountId: true,
    hasExpenseAccountId: false,
  },
  Quotes: {
    dateField: "quoteDate",
    numberField: "quoteNumber",
    contactField: "customerId",
    hasItemsAccountId: false,
    hasExpenseAccountId: false,
  },
  "Sales Orders": {
    dateField: "orderDate",
    numberField: "salesOrderNumber",
    contactField: "customerId",
    hasItemsAccountId: false,
    hasExpenseAccountId: false,
  },
  Expenses: {
    dateField: "date",
    numberField: "expenseNumber",
    contactField: "both",
    hasItemsAccountId: false,
    hasExpenseAccountId: true,
  },
  "Delivery Challans": {
    dateField: "challanDate",
    numberField: "challanNumber",
    contactField: "customerId",
    hasItemsAccountId: false,
    hasExpenseAccountId: false,
  },
};

// ─── Search / Filter transactions ────────────────────────────────────────────
export const searchTransactions = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const {
      moduleType,
      accountId,
      dateFrom,
      dateTo,
      status,
      search,
    } = req.query as Record<string, string>;

    if (!moduleType) throw new ValidationError("moduleType is required");

    const Model = MODULE_MAP[moduleType];
    if (!Model) throw new ValidationError(`Unsupported module: ${moduleType}`);

    const meta = MODULE_META[moduleType];
    const filter: any = { organizationId: oid };

    // Filter by account
    if (accountId) {
      const accObjId = new mongoose.Types.ObjectId(accountId);
      const accountOr: any[] = [];
      if (meta.hasItemsAccountId) {
        accountOr.push({ "items.accountId": accObjId });
      }
      if (meta.hasExpenseAccountId) {
        accountOr.push({ expenseAccountId: accObjId });
        accountOr.push({ "lineItems.expenseAccountId": accObjId });
      }
      if (accountOr.length > 0) filter.$or = accountOr;
    }

    // Date range
    if (dateFrom || dateTo) {
      filter[meta.dateField] = {};
      if (dateFrom) filter[meta.dateField].$gte = new Date(dateFrom);
      if (dateTo)
        filter[meta.dateField].$lte = new Date(dateTo + "T23:59:59Z");
    }

    // Status filter
    if (status && status !== "All") filter.status = status;

    // Text search — only match fields that exist in this schema
    if (search) {
      const rx = { $regex: search, $options: "i" };
      filter.$or = [
        { [meta.numberField]: rx },
        { referenceNumber: rx },
        { notes: rx },
        { subject: rx },
      ];
    }

    // Build populate chain based on actual schema fields
    let query = Model.find(filter).limit(50) as any;
    if (meta.contactField === "customerId" || meta.contactField === "both") {
      query = query.populate("customerId", "displayName companyName");
    }
    if (meta.contactField === "vendorId" || meta.contactField === "both") {
      query = query.populate("vendorId", "displayName companyName");
    }
    if (meta.hasItemsAccountId) {
      query = query.populate("items.accountId", "name");
    }

    const docs = await query.lean();

    // Normalise to a consistent shape
    const transactions = docs.map((doc: any) => {
      const lineItems: any[] = doc.items || doc.lineItems || [];
      const accountNames = meta.hasItemsAccountId
        ? lineItems
            .map((i: any) =>
              typeof i.accountId === "object" ? i.accountId?.name : null
            )
            .filter(Boolean)
            .join(", ")
        : meta.hasExpenseAccountId
        ? (doc.expenseAccountId as any)?.name || ""
        : "";

      return {
        _id: doc._id,
        number: doc[meta.numberField] || doc._id,
        date: doc[meta.dateField] || doc.createdAt,
        status: doc.status || "—",
        total: doc.total ?? doc.amount ?? 0,
        contact:
          (doc.customerId as any)?.displayName ||
          (doc.vendorId as any)?.displayName ||
          "—",
        accountNames,
      };
    });

    res.json({ success: true, data: transactions, total: transactions.length });
  }
);

// ─── Execute Bulk Update ─────────────────────────────────────────────────────
export const executeBulkUpdate = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const {
      moduleType,
      transactionIds,
      oldAccountId,
      newAccountId,
      oldAccountName,
      newAccountName,
    }: {
      moduleType: string;
      transactionIds: string[];
      oldAccountId: string;
      newAccountId: string;
      oldAccountName: string;
      newAccountName: string;
    } = req.body;

    if (!moduleType) throw new ValidationError("moduleType is required");
    if (!transactionIds?.length)
      throw new ValidationError("Select at least one transaction");
    if (!newAccountId) throw new ValidationError("New account is required");
    if (transactionIds.length > 50)
      throw new ValidationError("Maximum 50 transactions can be updated at once");

    const Model = MODULE_MAP[moduleType];
    if (!Model) throw new ValidationError(`Unsupported module: ${moduleType}`);

    const objectIds = transactionIds.map(
      (id) => new mongoose.Types.ObjectId(id)
    );
    const newAccObjId = new mongoose.Types.ObjectId(newAccountId);

    // Update items.accountId inside matching documents
    let updatedCount = 0;
    if (oldAccountId) {
      const oldAccObjId = new mongoose.Types.ObjectId(oldAccountId);
      const result = await Model.updateMany(
        {
          _id: { $in: objectIds },
          organizationId: oid,
          "items.accountId": oldAccObjId,
        },
        { $set: { "items.$[elem].accountId": newAccObjId } },
        {
          arrayFilters: [{ "elem.accountId": oldAccObjId }],
        }
      );
      updatedCount = result.modifiedCount;

      // Also handle top-level expenseAccountId (Expenses module)
      await Model.updateMany(
        {
          _id: { $in: objectIds },
          organizationId: oid,
          expenseAccountId: oldAccObjId,
        },
        { $set: { expenseAccountId: newAccObjId } }
      );
    } else {
      // No specific old account — replace ALL items' accountId
      const result = await Model.updateMany(
        { _id: { $in: objectIds }, organizationId: oid },
        { $set: { "items.$[].accountId": newAccObjId } }
      );
      updatedCount = result.modifiedCount;
    }

    // Record history
    const job: BulkUpdateJob = {
      id: new mongoose.Types.ObjectId().toString(),
      organizationId: oid,
      moduleType,
      oldAccountId: oldAccountId || "",
      oldAccountName: oldAccountName || "Any",
      newAccountId,
      newAccountName,
      transactionIds,
      updatedCount,
      status: "Completed",
      performedAt: new Date().toISOString(),
    };
    jobStore.unshift(job);

    res.json({ success: true, data: job });
  }
);

// ─── Get History ─────────────────────────────────────────────────────────────
export const getHistory = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const history = jobStore.filter((j) => j.organizationId === oid);
    res.json({ success: true, data: history });
  }
);
