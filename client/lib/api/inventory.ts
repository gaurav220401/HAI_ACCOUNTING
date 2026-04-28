import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

export type InventoryDirection = "Increase" | "Decrease";

export interface InventoryAdjustmentItemRef {
  _id: string;
  name: string;
  sku?: string;
}

export interface InventoryAdjustmentWarehouseRef {
  _id: string;
  name: string;
}

export interface InventoryAdjustment {
  _id: string;
  itemId: InventoryAdjustmentItemRef | string;
  warehouseId?: InventoryAdjustmentWarehouseRef | string | null;
  direction: InventoryDirection;
  quantityDelta: number;
  valueDelta: number;
  reason: string;
  referenceNumber?: string;
  notes?: string;
  adjustedAt: string;
  resultingStockOnHand: number;
  resultingInventoryValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLowStockRow {
  _id: string;
  name: string;
  sku?: string;
  stockOnHand: number;
  reorderPoint?: number;
  averageCost: number;
  inventoryValue: number;
}

export interface InventoryOverviewResponse {
  period: string;
  summary: {
    trackedItems: number;
    outOfStockItems: number;
    lowStockItems: number;
    totalQuantity: number;
    totalValue: number;
  };
  categoryDistribution: {
    category: string;
    count: number;
    value: number;
  }[];
  pendingActions: {
    sales: { toPack: number; toShip: number; toDeliver: number; toInvoice: number };
    purchases: { toBeReceived: number; receiveInProgress: number };
    inventory: { belowReorder: number };
  };
  topSellingItems: Array<{ _id: string; name: string; sku: string; quantity: number; revenue: number }>;
  salesByChannel: Array<{ channel: string; amount: number }>;
  salesOrderSummary: Array<{ _id: string; quantity: number; value: number }>;
  topStockedItems: {
    byQuantity: Array<{ name: string; stockOnHand: number; inventoryValue: number }>;
    byValue: Array<{ name: string; stockOnHand: number; inventoryValue: number }>;
  };
  topVendors: Array<{ name: string; totalPurchases: number; quantity: number }>;
  receiveHistory: Array<{ date: string; receiveNumber: string; vendor: string; quantity: number }>;
  lowStockItems: InventoryLowStockRow[];
}

export interface CreateInventoryAdjustmentInput {
  itemId: string;
  direction: InventoryDirection;
  adjustmentType?: "Quantity" | "Value";
  quantityDelta: number;
  accountId?: string;
  unitCost?: number;
  valueDelta?: number;
  warehouseId?: string;
  reason?: string;
  referenceNumber?: string;
  notes?: string;
  adjustedAt?: string;
}

export interface InventoryAdjustmentListParams extends ListParams {
  itemId?: string;
}

export const inventoryApi = {
  getOverview: (period?: string) => apiFetch<{ data: InventoryOverviewResponse }>(`/inventory/overview${period ? `?period=${period}` : ""}`),

  listAdjustments: (params?: InventoryAdjustmentListParams) =>
    apiFetch<PaginatedResponse<InventoryAdjustment>>(
      `/inventory/adjustments${buildQuery(params || {})}`,
    ),

  createAdjustment: (data: CreateInventoryAdjustmentInput) =>
    apiFetch<{ data: InventoryAdjustment }>("/inventory/adjustments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  syncStock: (itemId: string) =>
    apiFetch<{ data: { stockOnHand: number } }>(`/inventory/sync/${itemId}`, {
      method: "POST",
    }),
};

