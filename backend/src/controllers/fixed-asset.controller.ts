import { Response } from "express";
import { Types } from "mongoose";
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
import Account from "../models/account.model";
import Bill from "../models/bill.model";

function orgId(req: AuthenticatedRequest): Types.ObjectId {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id as Types.ObjectId;
}

async function findMappedAccount(params: {
  organizationId: Types.ObjectId;
  accountId: unknown;
  fieldLabel: string;
}) {
  const accountId = String(params.accountId || "").trim();
  if (!accountId || !Types.ObjectId.isValid(accountId)) {
    throw new ValidationError(`${params.fieldLabel} must be a valid account id`);
  }

  const account = await Account.findOne({
    _id: accountId,
    organizationId: params.organizationId,
    isDeleted: false,
    isGroup: false,
  })
    .select("name code rootType accountType")
    .lean();

  if (!account) {
    throw new ValidationError(`${params.fieldLabel} account was not found`);
  }

  return account;
}

async function validateFixedAssetAccountMappings(params: {
  organizationId: Types.ObjectId;
  fixedAssetAccountId: unknown;
  accumulatedDepreciationAccountId: unknown;
  depreciationExpenseAccountId: unknown;
}) {
  const [fixedAssetAccount, accumulatedAccount, expenseAccount] =
    await Promise.all([
      findMappedAccount({
        organizationId: params.organizationId,
        accountId: params.fixedAssetAccountId,
        fieldLabel: "fixedAssetAccountId",
      }),
      findMappedAccount({
        organizationId: params.organizationId,
        accountId: params.accumulatedDepreciationAccountId,
        fieldLabel: "accumulatedDepreciationAccountId",
      }),
      findMappedAccount({
        organizationId: params.organizationId,
        accountId: params.depreciationExpenseAccountId,
        fieldLabel: "depreciationExpenseAccountId",
      }),
    ]);

  if (fixedAssetAccount.accountType !== "Fixed Asset") {
    throw new ValidationError(
      "fixedAssetAccountId must reference an account of type Fixed Asset",
    );
  }

  if (accumulatedAccount.accountType !== "Contra Asset") {
    throw new ValidationError(
      "accumulatedDepreciationAccountId must reference an account of type Contra Asset",
    );
  }

  if (String(params.fixedAssetAccountId) === String(params.accumulatedDepreciationAccountId)) {
    throw new ValidationError(
      "Asset Account and Accumulated Depreciation Account cannot be the same GL account",
    );
  }

  if (expenseAccount.rootType !== "Expense") {
    throw new ValidationError(
      "depreciationExpenseAccountId must reference an Expense account",
    );
  }
}

async function hydrateLegacySourceBillInfo(
  organizationId: Types.ObjectId,
  assets: any[],
): Promise<any[]> {
  if (!assets.length) return assets;

  const missingAssetIds = assets
    .filter((asset) => !asset.sourceBillId)
    .map((asset) => String(asset._id || ""))
    .filter((id) => Types.ObjectId.isValid(id));

  if (!missingAssetIds.length) return assets;

  const bills = await Bill.find({
    organizationId,
    isDeleted: false,
    fixedAssetIds: {
      $in: missingAssetIds.map((id) => new Types.ObjectId(id)),
    },
  })
    .select("billNumber fixedAssetIds")
    .lean();

  if (!bills.length) return assets;

  const sourceByAssetId = new Map<string, { billId: string; billNumber: string }>();
  for (const bill of bills) {
    const billId = String(bill._id || "");
    const billNumber = String((bill as any).billNumber || "").trim();
    const fixedAssetIds = Array.isArray((bill as any).fixedAssetIds) ? (bill as any).fixedAssetIds : [];

    for (const fixedAssetId of fixedAssetIds) {
      const assetId = String(fixedAssetId || "");
      if (!assetId || sourceByAssetId.has(assetId)) continue;
      sourceByAssetId.set(assetId, { billId, billNumber });
    }
  }

  return assets.map((asset) => {
    if (asset.sourceBillId) return asset;
    const source = sourceByAssetId.get(String(asset._id || ""));
    if (!source) return asset;

    return {
      ...asset,
      sourceBillId: source.billId,
      sourceBillNumber: source.billNumber,
    };
  });
}

/** GET /api/fixed-assets?status=DRAFT|ACTIVE|DISPOSED|All&search=&page=1&limit=25 */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { status, search, page = 1, limit = 25 } = req.query;
    const organizationId = orgId(req);

    const filter: any = {
      organizationId,
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
      .populate("fixedAssetAccountId", "name code")
      .populate("accumulatedDepreciationAccountId", "name code")
      .populate("depreciationExpenseAccountId", "name code")
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    const hydrated = await hydrateLegacySourceBillInfo(organizationId, data as any[]);

    res.json({
      success: true,
      data: hydrated,
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
    const organizationId = orgId(req);
    const asset = await FixedAsset.findOne({
      _id: req.params.id,
      organizationId,
      isDeleted: false,
    })
      .populate("fixedAssetTypeId")
      .populate("fixedAssetAccountId", "name code")
      .populate("accumulatedDepreciationAccountId", "name code")
      .populate("depreciationExpenseAccountId", "name code")
      .lean();

    if (!asset) throw new NotFoundError("Fixed Asset");

    const [hydrated] = await hydrateLegacySourceBillInfo(organizationId, [asset]);

    res.json({ success: true, data: hydrated });
  },
);

/** POST /api/fixed-assets */
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = orgId(req);
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

    await validateFixedAssetAccountMappings({
      organizationId,
      fixedAssetAccountId,
      accumulatedDepreciationAccountId,
      depreciationExpenseAccountId,
    });

    const doc = new FixedAsset({
      organizationId,
      ...req.body,
      depreciationPercentage:
        depreciationMethod === "Declining Balance" ?
          Number(depreciationPercentage)
        : null,
      status: req.body.status || "DRAFT",
      comments: [
        {
          author: req.user?.name || req.user?.email || "System",
          text: "Fixed asset created.",
          time: new Date(),
          isSystem: true,
        },
      ],
    });

    attachUser(doc as any, req);
    await doc.save();

    const populated = await FixedAsset.findById(doc._id)
      .populate("fixedAssetTypeId", "name")
      .populate("fixedAssetAccountId", "name code")
      .populate("accumulatedDepreciationAccountId", "name code")
      .populate("depreciationExpenseAccountId", "name code");

    res.status(201).json({ success: true, data: populated });
  },
);

/** PATCH /api/fixed-assets/:id */
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = orgId(req);
    const asset = await FixedAsset.findOne({
      _id: req.params.id,
      organizationId,
      isDeleted: false,
    });

    if (!asset) throw new NotFoundError("Fixed Asset");

    const previousStatus = String(asset.status || "").toUpperCase();

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

    const nextStatus = String((asset as any).status || "").toUpperCase();
    if (previousStatus && nextStatus && previousStatus !== nextStatus) {
      (asset as any).comments.push({
        author: req.user?.name || req.user?.email || "System",
        text: `Status changed from ${previousStatus} to ${nextStatus}.`,
        time: new Date(),
        isSystem: true,
      });
    }

    await validateFixedAssetAccountMappings({
      organizationId,
      fixedAssetAccountId: (asset as any).fixedAssetAccountId,
      accumulatedDepreciationAccountId: (asset as any)
        .accumulatedDepreciationAccountId,
      depreciationExpenseAccountId: (asset as any).depreciationExpenseAccountId,
    });

    attachUser(asset as any, req);
    await asset.save();

    const populated = await FixedAsset.findById(asset._id)
      .populate("fixedAssetTypeId", "name")
      .populate("fixedAssetAccountId", "name code")
      .populate("accumulatedDepreciationAccountId", "name code")
      .populate("depreciationExpenseAccountId", "name code");

    res.json({ success: true, data: populated });
  },
);

/** POST /api/fixed-assets/:id/comments */
export const addComment = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = orgId(req);
    const text = String(req.body.text || "").trim();

    if (!text) throw new ValidationError("Comment text is required");

    const asset = await FixedAsset.findOne({
      _id: req.params.id,
      organizationId,
      isDeleted: false,
    });

    if (!asset) throw new NotFoundError("Fixed Asset");

    (asset as any).comments.push({
      author: req.user?.name || req.user?.email || "User",
      text,
      time: new Date(),
      isSystem: req.body.isSystem === true,
    });

    attachUser(asset as any, req);
    await asset.save();

    const comments = (asset as any).comments || [];
    res.json({ success: true, data: comments[comments.length - 1] });
  },
);

/** DELETE /api/fixed-assets/:id */
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = orgId(req);
    const asset = await FixedAsset.findOne({
      _id: req.params.id,
      organizationId,
    });

    if (!asset) throw new NotFoundError("Fixed Asset");

    (asset as any).comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: "Fixed asset deleted.",
      time: new Date(),
      isSystem: true,
    });
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
    const organizationId = orgId(req);
    const data = await FixedAssetType.find({
      organizationId,
      isDeleted: false,
      isActive: true,
    })
      .populate("fixedAssetAccountId", "name code")
      .populate("accumulatedDepreciationAccountId", "name code")
      .populate("depreciationExpenseAccountId", "name code")
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, data });
  },
);

/** POST /api/fixed-assets/types */
export const createType = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = orgId(req);
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

    await validateFixedAssetAccountMappings({
      organizationId,
      fixedAssetAccountId,
      accumulatedDepreciationAccountId,
      depreciationExpenseAccountId,
    });

    const existing = await FixedAssetType.findOne({
      organizationId,
      name: String(name).trim(),
      isDeleted: false,
    });
    if (existing) {
      throw new ValidationError(
        "A fixed asset type with this name already exists",
      );
    }

    const doc = new FixedAssetType({
      organizationId,
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
      .populate("fixedAssetAccountId", "name code")
      .populate("accumulatedDepreciationAccountId", "name code")
      .populate("depreciationExpenseAccountId", "name code");

    res.status(201).json({ success: true, data: populated });
  },
);

/** PATCH /api/fixed-assets/types/:typeId */
export const updateType = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = orgId(req);
    const type = await FixedAssetType.findOne({
      _id: req.params.typeId,
      organizationId,
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

    await validateFixedAssetAccountMappings({
      organizationId,
      fixedAssetAccountId: (type as any).fixedAssetAccountId,
      accumulatedDepreciationAccountId: (type as any)
        .accumulatedDepreciationAccountId,
      depreciationExpenseAccountId: (type as any)
        .depreciationExpenseAccountId,
    });

    attachUser(type as any, req);
    await type.save();

    const populated = await FixedAssetType.findById(type._id)
      .populate("fixedAssetAccountId", "name code")
      .populate("accumulatedDepreciationAccountId", "name code")
      .populate("depreciationExpenseAccountId", "name code");

    res.json({ success: true, data: populated });
  },
);

/** DELETE /api/fixed-assets/types/:typeId */
export const removeType = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = orgId(req);
    const type = await FixedAssetType.findOne({
      _id: req.params.typeId,
      organizationId,
    });

    if (!type) throw new NotFoundError("Fixed Asset Type");

    type.isDeleted = true;
    type.deletedAt = new Date();
    attachUser(type as any, req);
    await type.save();

    res.json({ success: true, message: "Fixed asset type deleted" });
  },
);
