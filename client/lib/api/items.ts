import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type ItemType = "Goods" | "Service";
export type TaxPreference = "Taxable" | "NonTaxable" | "Exempt";
export type ItemMode = "SingleItem" | "Variants";
export type DimensionUnit = "cm" | "m" | "in" | "ft";
export type WeightUnit = "kg" | "g" | "lb" | "oz";

export interface ItemDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit?: DimensionUnit;
}

export interface ItemWeight {
  value?: number;
  unit?: WeightUnit;
}

export interface Item {
  _id: string;
  organizationId: string;
  name: string;
  sku?: string;
  identifiers?: string[];
  itemMode?: ItemMode;
  brand?: string;
  manufacturer?: string;
  itemType: ItemType;
  unit?: UnitOfMeasurement | string | null;
  itemGroupId?: ItemGroup | string | null;
  description?: string;
  sellingPrice: number;
  sellingDescription?: string;
  costPrice: number;
  purchaseDescription?: string;
  salesAccountId?: string | null;
  purchaseAccountId?: string | null;
  inventoryAccountId?: string | null;
  valuationMethod?: "MovingAverage" | "FIFO";
  taxPreference: TaxPreference;
  taxId?: string | null;
  hsnSacCode?: string;
  inventoryTracked: boolean;
  stockOnHand: number;
  inventoryValue: number;
  averageCost: number;
  reorderPoint?: number;
  returnableItem?: boolean;
  dimensions?: ItemDimensions;
  weight?: ItemWeight;
  preferredVendorId?: string | null;
  warehouseId?: string | null;
  image?: string;
  rearImage?: string;
  otherImages?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemInput {
  name: string;
  sku?: string;
  identifiers?: string[];
  itemMode?: ItemMode;
  brand?: string;
  manufacturer?: string;
  itemType?: ItemType;
  unit?: string;
  itemGroupId?: string;
  description?: string;
  sellingPrice?: number;
  sellingDescription?: string;
  costPrice?: number;
  purchaseDescription?: string;
  salesAccountId?: string;
  purchaseAccountId?: string;
  inventoryAccountId?: string;
  taxPreference?: TaxPreference;
  taxId?: string;
  hsnSacCode?: string;
  valuationMethod?: "MovingAverage" | "FIFO";
  inventoryTracked?: boolean;
  stockOnHand?: number;
  averageCost?: number;
  inventoryValue?: number;
  reorderPoint?: number;
  returnableItem?: boolean;
  dimensions?: ItemDimensions;
  weight?: ItemWeight;
  preferredVendorId?: string;
  warehouseId?: string;
  image?: string;
  rearImage?: string;
  otherImages?: string[];
}

export type UpdateItemInput = Partial<CreateItemInput>;

export interface ItemGroup {
  _id: string;
  orgId: string;
  name: string;
  parentId?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnitOfMeasurement {
  _id: string;
  orgId: string;
  name: string;
  abbreviation: string;
  isActive: boolean;
  isSystemUnit: boolean;
  createdAt: string;
}

// ─── API ────────────────────────────────────────────────────────────────

export const itemApi = {
  // Items
  list: (params?: ListParams) =>
    apiFetch<PaginatedResponse<Item>>(`/items${buildQuery(params || {})}`),

  getById: (id: string) =>
    apiFetch<{ data: Item }>(`/items/${id}`),

  create: (data: CreateItemInput) =>
    apiFetch<{ data: Item }>("/items", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateItemInput) =>
    apiFetch<{ data: Item }>(`/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/items/${id}`, { method: "DELETE" }),

  // Item Groups
  listGroups: () =>
    apiFetch<{ data: ItemGroup[] }>("/items/groups"),

  createGroup: (data: { name: string; parentId?: string; description?: string }) =>
    apiFetch<{ data: ItemGroup }>("/items/groups", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateGroup: (id: string, data: Partial<{ name: string; parentId: string; description: string }>) =>
    apiFetch<{ data: ItemGroup }>(`/items/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: string) =>
    apiFetch<{ success: boolean }>(`/items/groups/${id}`, { method: "DELETE" }),

  // Units of Measurement
  listUnits: () =>
    apiFetch<{ data: UnitOfMeasurement[] }>("/items/units"),

  createUnit: (data: { name: string; abbreviation: string }) =>
    apiFetch<{ data: UnitOfMeasurement }>("/items/units", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteUnit: (id: string) =>
    apiFetch<{ success: boolean }>(`/items/units/${id}`, { method: "DELETE" }),

  seedUnits: () =>
    apiFetch<{ message: string }>("/items/units/seed", { method: "POST" }),

  clone: (id: string) =>
    apiFetch<{ data: Item }>(`/items/${id}/clone`, { method: "POST" }),
};
