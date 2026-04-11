import { apiFetch, buildQuery } from "./client";
import type { ListParams, PaginatedResponse } from "./client";

export type DepreciationMethod = "Straight Line" | "Declining Balance";
export type DepreciationFrequency = "Monthly" | "Yearly";
export type AssetLifeUnit = "Months" | "Days";
export type ComputationType = "Non Pro Rata" | "Pro Rata";
export type FixedAssetStatus = "DRAFT" | "ACTIVE" | "DISPOSED";

export interface RefName {
  _id: string;
  name: string;
  code?: string;
}

export interface FixedAssetType {
  _id: string;
  organizationId: string;
  name: string;
  depreciationMethod: DepreciationMethod;
  depreciationPercentage?: number | null;
  depreciationFrequency: DepreciationFrequency;
  assetLifeValue: number;
  assetLifeUnit: AssetLifeUnit;
  computationType: ComputationType;
  fixedAssetAccountId: string | RefName;
  accumulatedDepreciationAccountId: string | RefName;
  depreciationExpenseAccountId: string | RefName;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAsset {
  _id: string;
  organizationId: string;
  assetName: string;
  assetNumber: string;
  purchaseValue: number;
  purchaseQuantity: number;
  currentQuantity: number;
  serialNumber?: string;
  currentValue: number;
  disposalValue: number;
  fixedAssetTypeId: string | Pick<FixedAssetType, "_id" | "name">;
  purchaseDate: string;
  warrantyExpirationDate?: string | null;
  description?: string;
  depreciationMethod: DepreciationMethod;
  depreciationPercentage?: number | null;
  depreciationFrequency: DepreciationFrequency;
  assetLifeValue: number;
  assetLifeUnit: AssetLifeUnit;
  computationType: ComputationType;
  depreciationStartDate: string;
  fixedAssetAccountId: string | RefName;
  accumulatedDepreciationAccountId: string | RefName;
  depreciationExpenseAccountId: string | RefName;
  status: FixedAssetStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAssetListParams extends ListParams {
  status?: FixedAssetStatus | "All";
  search?: string;
}

export interface CreateFixedAssetTypeInput {
  name: string;
  depreciationMethod: DepreciationMethod;
  depreciationPercentage?: number;
  depreciationFrequency: DepreciationFrequency;
  assetLifeValue: number;
  assetLifeUnit: AssetLifeUnit;
  computationType: ComputationType;
  fixedAssetAccountId: string;
  accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
}

export type UpdateFixedAssetTypeInput = Partial<CreateFixedAssetTypeInput> & {
  isActive?: boolean;
};

export interface CreateFixedAssetInput {
  assetName: string;
  purchaseValue?: number;
  purchaseQuantity?: number;
  currentQuantity?: number;
  serialNumber?: string;
  currentValue?: number;
  disposalValue?: number;
  fixedAssetTypeId: string;
  purchaseDate: string;
  warrantyExpirationDate?: string | null;
  description?: string;
  depreciationMethod: DepreciationMethod;
  depreciationPercentage?: number;
  depreciationFrequency: DepreciationFrequency;
  assetLifeValue: number;
  assetLifeUnit: AssetLifeUnit;
  computationType: ComputationType;
  depreciationStartDate: string;
  fixedAssetAccountId: string;
  accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
  status?: FixedAssetStatus;
}

export type UpdateFixedAssetInput = Partial<CreateFixedAssetInput> & {
  isActive?: boolean;
};

export const fixedAssetApi = {
  list: (params?: FixedAssetListParams) =>
    apiFetch<PaginatedResponse<FixedAsset>>(
      `/fixed-assets${buildQuery(params || {})}`,
    ),

  getById: (id: string) =>
    apiFetch<{ data: FixedAsset }>(`/fixed-assets/${id}`),

  create: (data: CreateFixedAssetInput) =>
    apiFetch<{ data: FixedAsset }>("/fixed-assets", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateFixedAssetInput) =>
    apiFetch<{ data: FixedAsset }>(`/fixed-assets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean; message: string }>(`/fixed-assets/${id}`, {
      method: "DELETE",
    }),

  listTypes: () => apiFetch<{ data: FixedAssetType[] }>("/fixed-assets/types"),

  createType: (data: CreateFixedAssetTypeInput) =>
    apiFetch<{ data: FixedAssetType }>("/fixed-assets/types", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateType: (typeId: string, data: UpdateFixedAssetTypeInput) =>
    apiFetch<{ data: FixedAssetType }>(`/fixed-assets/types/${typeId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  removeType: (typeId: string) =>
    apiFetch<{ success: boolean; message: string }>(
      `/fixed-assets/types/${typeId}`,
      {
        method: "DELETE",
      },
    ),
};
