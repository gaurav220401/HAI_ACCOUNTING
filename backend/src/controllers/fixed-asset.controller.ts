import { Response } from "express";
import { attachUser } from "../plugins";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import FixedAsset from "../models/fixed-asset.model";
import FixedAssetType from "../models/fixed-asset-type.model";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

/** GET /api/fixed-assets?status=DRAFT|ACTIVE|DISPOSED|All&search=&page=1&limit=25 */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { status, search, page = 1, limit = 25 } = req.query;

    const filter: any = {
      organizationId: orgId(req),
      isDeleted: false,
    };

    if (status && status !== "All") {
      filter.status = String(status).toUpperCase();
    }

    if (search) {
      filter.$or = [
        { assetName: { $regex: search, $options: "i" } },
        { assetNumber: { $regex: search, $options: "i" } },
        { serialNumber: { $regex: search, $options: "i" } },
      ];
    }

    const total = await FixedAsset.countDocuments(filter);
    const data = await FixedAsset.find(filter)
      .populate("fixedAssetTypeId", "name")
      .populate("fixedAssetAccountId", "name")
      .populate("accumulatedDepreciationAccountId", "name")
      .populate("depreciationExpenseAccountId", "name")
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page: +page,
        limit: +limit,
        pages: Math.ceil(total / +limit),
      },
    });
  },
);

/** GET /api/fixed-assets/:id */
export const getOne = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const asset = await FixedAsset.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    })
      .populate("fixedAssetTypeId")
      .populate("fixedAssetAccountId", "name")
      .populate("accumulatedDepreciationAccountId", "name")
      .populate("depreciationExpenseAccountId", "name");

    if (!asset) throw new NotFoundError("Fixed Asset");

    res.json({ success: true, data: asset });
  },
);

/** POST /api/fixed-assets */
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      assetName,
      purchaseDate,
      fixedAssetTypeId,
      depreciationMethod,
      depreciationPercentage,
      depreciationFrequency,
      assetLifeValue,
      computationType,
      depreciationStartDate,
      fixedAssetAccountId,
      accumulatedDepreciationAccountId,
      depreciationExpenseAccountId,
    } = req.body;

    if (!assetName) throw new ValidationError("assetName is required");
    if (!purchaseDate) throw new ValidationError("purchaseDate is required");
    if (!fixedAssetTypeId)
      throw new ValidationError("fixedAssetTypeId is required");
    if (!depreciationMethod)
      throw new ValidationError("depreciationMethod is required");
    if (!depreciationFrequency)
      throw new ValidationError("depreciationFrequency is required");
    if (!assetLifeValue || Number(assetLifeValue) <= 0) {
      throw new ValidationError("assetLifeValue must be greater than 0");
    }
    if (depreciationMethod === "Declining Balance") {
      const percentage = Number(depreciationPercentage);
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        throw new ValidationError(
          "depreciationPercentage must be between 0 and 100 for Declining Balance",
        );
      }
    }
    if (!computationType)
      throw new ValidationError("computationType is required");
    if (!depreciationStartDate)
      throw new ValidationError("depreciationStartDate is required");
    if (!fixedAssetAccountId)
      throw new ValidationError("fixedAssetAccountId is required");
    if (!accumulatedDepreciationAccountId) {
      throw new ValidationError("accumulatedDepreciationAccountId is required");
    }
    if (!depreciationExpenseAccountId) {
      throw new ValidationError("depreciationExpenseAccountId is required");
    }

    const doc = new FixedAsset({
      organizationId: orgId(req),
      ...req.body,
      depreciationPercentage:
        depreciationMethod === "Declining Balance" ?
          Number(depreciationPercentage)
        : null,
      status: req.body.status || "DRAFT",
    });

    attachUser(doc as any, req);
    await doc.save();

    const populated = await FixedAsset.findById(doc._id)
      .populate("fixedAssetTypeId", "name")
      .populate("fixedAssetAccountId", "name")
      .populate("accumulatedDepreciationAccountId", "name")
      .populate("depreciationExpenseAccountId", "name");

    res.status(201).json({ success: true, data: populated });
  },
);

/** PATCH /api/fixed-assets/:id */
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const asset = await FixedAsset.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    });

    if (!asset) throw new NotFoundError("Fixed Asset");

    const allowed = [
      "assetName",
      "purchaseValue",
      "purchaseQuantity",
      "currentQuantity",
      "serialNumber",
      "currentValue",
      "disposalValue",
      "fixedAssetTypeId",
      "purchaseDate",
      "warrantyExpirationDate",
      "description",
      "depreciationMethod",
      "depreciationPercentage",
      "depreciationFrequency",
      "assetLifeValue",
      "assetLifeUnit",
      "computationType",
      "depreciationStartDate",
      "fixedAssetAccountId",
      "accumulatedDepreciationAccountId",
      "depreciationExpenseAccountId",
      "status",
      "isActive",
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        (asset as any)[field] = req.body[field];
      }
    });

    const nextMethod = (req.body.depreciationMethod ??
      asset.depreciationMethod) as string;
    const nextPercentage =
      req.body.depreciationPercentage ?? (asset as any).depreciationPercentage;

    if (nextMethod === "Declining Balance") {
      const percentage = Number(nextPercentage);
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        throw new ValidationError(
          "depreciationPercentage must be between 0 and 100 for Declining Balance",
        );
      }
      (asset as any).depreciationPercentage = percentage;
    } else {
      (asset as any).depreciationPercentage = null;
    }

    attachUser(asset as any, req);
    await asset.save();

    const populated = await FixedAsset.findById(asset._id)
      .populate("fixedAssetTypeId", "name")
      .populate("fixedAssetAccountId", "name")
      .populate("accumulatedDepreciationAccountId", "name")
      .populate("depreciationExpenseAccountId", "name");

    res.json({ success: true, data: populated });
  },
);

/** DELETE /api/fixed-assets/:id */
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const asset = await FixedAsset.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });

    if (!asset) throw new NotFoundError("Fixed Asset");

    asset.isDeleted = true;
    asset.deletedAt = new Date();
    attachUser(asset as any, req);
    await asset.save();

    res.json({ success: true, message: "Fixed asset deleted" });
  },
);

/** GET /api/fixed-assets/types */
export const listTypes = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const data = await FixedAssetType.find({
      organizationId: orgId(req),
      isDeleted: false,
      isActive: true,
    })
      .populate("fixedAssetAccountId", "name")
      .populate("accumulatedDepreciationAccountId", "name")
      .populate("depreciationExpenseAccountId", "name")
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, data });
  },
);

/** POST /api/fixed-assets/types */
export const createType = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      name,
      depreciationMethod,
      depreciationPercentage,
      depreciationFrequency,
      assetLifeValue,
      assetLifeUnit,
      computationType,
      fixedAssetAccountId,
      accumulatedDepreciationAccountId,
      depreciationExpenseAccountId,
    } = req.body;

    if (!name) throw new ValidationError("name is required");
    if (!depreciationMethod)
      throw new ValidationError("depreciationMethod is required");
    if (depreciationMethod === "Declining Balance") {
      const percentage = Number(depreciationPercentage);
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        throw new ValidationError(
          "depreciationPercentage must be between 0 and 100 for Declining Balance",
        );
      }
    }
    if (!depreciationFrequency)
      throw new ValidationError("depreciationFrequency is required");
    if (!assetLifeValue || Number(assetLifeValue) <= 0) {
      throw new ValidationError("assetLifeValue must be greater than 0");
    }
    if (!assetLifeUnit) throw new ValidationError("assetLifeUnit is required");
    if (!computationType)
      throw new ValidationError("computationType is required");
    if (!fixedAssetAccountId)
      throw new ValidationError("fixedAssetAccountId is required");
    if (!accumulatedDepreciationAccountId) {
      throw new ValidationError("accumulatedDepreciationAccountId is required");
    }
    if (!depreciationExpenseAccountId) {
      throw new ValidationError("depreciationExpenseAccountId is required");
    }

    const existing = await FixedAssetType.findOne({
      organizationId: orgId(req),
      name: String(name).trim(),
      isDeleted: false,
    });
    if (existing) {
      throw new ValidationError(
        "A fixed asset type with this name already exists",
      );
    }

    const doc = new FixedAssetType({
      organizationId: orgId(req),
      ...req.body,
      depreciationPercentage:
        depreciationMethod === "Declining Balance" ?
          Number(depreciationPercentage)
        : null,
      name: String(name).trim(),
    });

    attachUser(doc as any, req);
    await doc.save();

    const populated = await FixedAssetType.findById(doc._id)
      .populate("fixedAssetAccountId", "name")
      .populate("accumulatedDepreciationAccountId", "name")
      .populate("depreciationExpenseAccountId", "name");

    res.status(201).json({ success: true, data: populated });
  },
);

/** PATCH /api/fixed-assets/types/:typeId */
export const updateType = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const type = await FixedAssetType.findOne({
      _id: req.params.typeId,
      organizationId: orgId(req),
      isDeleted: false,
    });

    if (!type) throw new NotFoundError("Fixed Asset Type");

    const allowed = [
      "name",
      "depreciationMethod",
      "depreciationPercentage",
      "depreciationFrequency",
      "assetLifeValue",
      "assetLifeUnit",
      "computationType",
      "fixedAssetAccountId",
      "accumulatedDepreciationAccountId",
      "depreciationExpenseAccountId",
      "isActive",
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        (type as any)[field] = req.body[field];
      }
    });

    const nextMethod = (req.body.depreciationMethod ??
      type.depreciationMethod) as string;
    const nextPercentage =
      req.body.depreciationPercentage ?? (type as any).depreciationPercentage;

    if (nextMethod === "Declining Balance") {
      const percentage = Number(nextPercentage);
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        throw new ValidationError(
          "depreciationPercentage must be between 0 and 100 for Declining Balance",
        );
      }
      (type as any).depreciationPercentage = percentage;
    } else {
      (type as any).depreciationPercentage = null;
    }

    attachUser(type as any, req);
    await type.save();

    const populated = await FixedAssetType.findById(type._id)
      .populate("fixedAssetAccountId", "name")
      .populate("accumulatedDepreciationAccountId", "name")
      .populate("depreciationExpenseAccountId", "name");

    res.json({ success: true, data: populated });
  },
);

/** DELETE /api/fixed-assets/types/:typeId */
export const removeType = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const type = await FixedAssetType.findOne({
      _id: req.params.typeId,
      organizationId: orgId(req),
    });

    if (!type) throw new NotFoundError("Fixed Asset Type");

    type.isDeleted = true;
    type.deletedAt = new Date();
    attachUser(type as any, req);
    await type.save();

    res.json({ success: true, message: "Fixed asset type deleted" });
  },
);
