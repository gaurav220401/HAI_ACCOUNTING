import { ORG_ID } from "./harness";

/**
 * Fixtures for the Inventory section, shaped to match the real API responses
 * (see lib/api/inventory.ts, move-orders.ts, putaways.ts, packages.ts).
 *
 * The numbers are internally consistent on purpose: the overview totals agree
 * with the stock figures, and the low-stock rows really are below their reorder
 * points. That lets the tests assert on business meaning, not just presence.
 */

export const warehouses = [
  { _id: "w1", name: "Bhilai Main", isPrimary: true },
  { _id: "w2", name: "Raipur Depot", isPrimary: false },
];

export const overview = {
  period: "this_month",
  summary: {
    trackedItems: 42,
    outOfStockItems: 3,
    lowStockItems: 7,
    totalQuantity: 12480,
    totalValue: 4863200,
  },
  categoryDistribution: [
    { category: "Raw Material", count: 24, value: 3120000 },
    { category: "Finished Goods", count: 18, value: 1743200 },
  ],
  pendingActions: {
    sales: { toPack: 5, toShip: 3, toDeliver: 2, toInvoice: 4 },
    purchases: { toBeReceived: 6, receiveInProgress: 1, pendingPutaways: 2 },
    inventory: { belowReorder: 7 },
  },
  topSellingItems: [
    { _id: "i1", name: "Steel Rod 12mm", sku: "SR-12", quantity: 320, revenue: 204800 },
    { _id: "i2", name: "Cement Bag 50kg", sku: "CEM-50", quantity: 180, revenue: 73800 },
  ],
  salesByChannel: [
    { channel: "Direct", amount: 218600 },
    { channel: "Online", amount: 60000 },
  ],
  salesOrderSummary: [
    { _id: "Draft", quantity: 12, value: 48000 },
    { _id: "Approved", quantity: 30, value: 190000 },
  ],
  topStockedItems: {
    byQuantity: [
      { name: "Steel Rod 12mm", stockOnHand: 240, inventoryValue: 124800 },
      { name: "Cement Bag 50kg", stockOnHand: 8, inventoryValue: 2840 },
    ],
    byValue: [
      { name: "Steel Rod 12mm", stockOnHand: 240, inventoryValue: 124800 },
      { name: "Cement Bag 50kg", stockOnHand: 8, inventoryValue: 2840 },
    ],
  },
  topVendors: [
    { name: "Shree Traders", totalPurchases: 412000, quantity: 800 },
    { name: "Acme Supplies", totalPurchases: 96000, quantity: 210 },
  ],
  receiveHistory: [
    { date: "2026-07-20T00:00:00.000Z", receiveNumber: "PR-000004", vendor: "Shree Traders", quantity: 200 },
  ],
  lowStockItems: [
    { _id: "i2", name: "Cement Bag 50kg", sku: "CEM-50", stockOnHand: 8, reorderPoint: 40, averageCost: 355, inventoryValue: 2840 },
    { _id: "i4", name: "Binding Wire 1kg", sku: "BW-01", stockOnHand: 0, reorderPoint: 25, averageCost: 78, inventoryValue: 0 },
  ],
};

export const adjustments = [
  {
    _id: "adj1",
    itemId: { _id: "i1", name: "Steel Rod 12mm", sku: "SR-12" },
    warehouseId: { _id: "w1", name: "Bhilai Main" },
    direction: "Increase",
    quantityDelta: 40,
    valueDelta: 20800,
    reason: "Stock found",
    referenceNumber: "ADJ-000001",
    notes: "Recount after audit",
    adjustedAt: "2026-07-18T00:00:00.000Z",
    resultingStockOnHand: 240,
    resultingInventoryValue: 124800,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  },
  {
    _id: "adj2",
    itemId: { _id: "i2", name: "Cement Bag 50kg", sku: "CEM-50" },
    warehouseId: { _id: "w1", name: "Bhilai Main" },
    direction: "Decrease",
    quantityDelta: -12,
    valueDelta: -4260,
    reason: "Damaged",
    referenceNumber: "ADJ-000002",
    notes: "Water damage in monsoon",
    adjustedAt: "2026-07-22T00:00:00.000Z",
    resultingStockOnHand: 8,
    resultingInventoryValue: 2840,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
  },
];

export const moveOrders = [
  {
    _id: "mo1",
    organizationId: ORG_ID,
    orderNumber: "MO-000001",
    fromWarehouseId: { _id: "w1", name: "Bhilai Main" },
    toWarehouseId: { _id: "w2", name: "Raipur Depot" },
    status: "Draft",
    items: [{ itemId: { _id: "i1", name: "Steel Rod 12mm" }, quantity: 25 }],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
  {
    _id: "mo2",
    organizationId: ORG_ID,
    orderNumber: "MO-000002",
    fromWarehouseId: { _id: "w2", name: "Raipur Depot" },
    toWarehouseId: { _id: "w1", name: "Bhilai Main" },
    status: "In Transit",
    items: [{ itemId: { _id: "i2", name: "Cement Bag 50kg" }, quantity: 60 }],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  },
];

export const putaways = [
  {
    _id: "pa1",
    putawayNumber: "PA-000001",
    purchaseReceiveId: { _id: "pr1", purchaseReceiveNumber: "PR-000004" },
    purchaseReceiveNumber: "PR-000004",
    warehouseId: { _id: "w1", name: "Bhilai Main" },
    status: "Completed",
    lineItems: [{ itemId: { _id: "i1", name: "Steel Rod 12mm" }, quantity: 200, putawayQuantity: 200 }],
    createdAt: "2026-07-21T00:00:00.000Z",
  },
  {
    _id: "pa2",
    putawayNumber: "PA-000002",
    purchaseReceiveId: { _id: "pr2", purchaseReceiveNumber: "PR-000005" },
    purchaseReceiveNumber: "PR-000005",
    warehouseId: { _id: "w2", name: "Raipur Depot" },
    status: "Draft",
    lineItems: [{ itemId: { _id: "i2", name: "Cement Bag 50kg" }, quantity: 100, putawayQuantity: 40 }],
    createdAt: "2026-07-24T00:00:00.000Z",
  },
];

export const salesOrders = [
  {
    _id: "so1",
    organizationId: ORG_ID,
    salesOrderNumber: "SO-000001",
    customerId: { _id: "c9", displayName: "Chhattisgarh Agro Food" },
    salesOrderDate: "2026-07-05T00:00:00.000Z",
    status: "APPROVED",
    shipmentStatus: "Pending",
    total: 184000,
    lineItems: [{ itemId: { _id: "i1", name: "Steel Rod 12mm" }, quantity: 100, rate: 640 }],
  },
  {
    _id: "so2",
    organizationId: ORG_ID,
    salesOrderNumber: "SO-000002",
    customerId: { _id: "c8", displayName: "N C Nahar" },
    salesOrderDate: "2026-07-12T00:00:00.000Z",
    status: "INVOICED",
    shipmentStatus: "Delivered",
    total: 41000,
    lineItems: [{ itemId: { _id: "i2", name: "Cement Bag 50kg" }, quantity: 100, rate: 410 }],
  },
];

export const packagesByOrder: Record<string, unknown[]> = {
  so1: [
    {
      _id: "pkg1",
      packageSlipNumber: "PKG-000001",
      salesOrderId: "so1",
      packageDate: "2026-07-06T00:00:00.000Z",
      lineItems: [{ itemId: { _id: "i1", name: "Steel Rod 12mm" }, quantity: 60 }],
    },
  ],
  so2: [],
};
