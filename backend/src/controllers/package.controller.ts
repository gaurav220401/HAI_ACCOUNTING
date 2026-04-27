import { Response } from "express";
import { AuthenticatedRequest } from "../types";
import Package from "../models/package.model";
import SalesOrder from "../models/sales-order.model";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import asyncHandler from "../utils/asyncHandler";
import { Types } from "mongoose";

const orgId = (req: AuthenticatedRequest) => {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
};

const attachUser = (doc: any, req: AuthenticatedRequest) => {
  doc.createdBy = req.user?._id;
  doc.updatedBy = req.user?._id;
};

export const createPackage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const { salesOrderId, packageSlipNumber, date, dimensions, weight, internalNotes, lineItems } = req.body;

  if (!salesOrderId) throw new ValidationError("Sales Order ID is required");

  const order = await SalesOrder.findOne({ _id: salesOrderId, organizationId: oid } as any);
  if (!order) throw new NotFoundError("Sales Order");

  const newPackage = new Package({
    organizationId: oid,
    salesOrderId,
    packageSlipNumber,
    date,
    dimensions,
    weight,
    internalNotes,
    lineItems,
  });

  attachUser(newPackage, req);
  await newPackage.save();

  const hasPackedLines = Array.isArray(lineItems)
    && lineItems.some((line) => Number(line?.quantityToPack || 0) > 0);

  if (hasPackedLines && String((order as any).shipmentStatus || "") !== "Delivered") {
    (order as any).shipmentStatus = "Shipped";
    if (String((order as any).status || "") === "DRAFT") {
      (order as any).status = "APPROVED";
    }
    attachUser(order, req);
    await order.save();
  }

  res.status(201).json({ success: true, data: newPackage });
});

export const listPackagesBySalesOrder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const { orderId } = req.params;

  const packages = await Package.find({
    organizationId: oid,
    salesOrderId: orderId,
    isDeleted: false,
  } as any).sort({ createdAt: -1 }).populate("lineItems.itemId", "name");

  res.json({ success: true, data: packages });
});

export const getPackage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const pkg = await Package.findOne({
    _id: req.params.id,
    organizationId: oid,
    isDeleted: false,
  } as any).populate("lineItems.itemId", "name");

  if (!pkg) throw new NotFoundError("Package");
  res.json({ success: true, data: pkg });
});

export const deletePackage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const pkg = await Package.findOne({ _id: req.params.id, organizationId: oid } as any);

  if (!pkg) throw new NotFoundError("Package");

  pkg.isDeleted = true;
  pkg.deletedAt = new Date();
  await pkg.save();

  res.json({ success: true, message: "Package deleted successfully" });
});
