import InventoryAdjustment from "../../models/inventory-adjustment.model";
import Package from "../../models/package.model";
import MoveOrder from "../../models/move-order.model";
import Putaway from "../../models/putaway.model";
import Warehouse from "../../models/warehouse.model";
import { Types } from "mongoose";

export async function createInventoryAdjustment(organizationId: any, data: any) {
  // InventoryAdjustment model is per-item. Create one entry per line item.
  const results = [];
  const items = data.lineItems || [];
  for (const item of items) {
    const adj = await InventoryAdjustment.create({
      organizationId,
      itemId: new Types.ObjectId(item.itemId),
      warehouseId: item.warehouseId ? new Types.ObjectId(item.warehouseId) : undefined,
      direction: (item.quantity || 0) >= 0 ? "Increase" : "Decrease",
      quantityDelta: Math.abs(Number(item.quantity) || 0),
      valueDelta: Math.abs(Number(item.valueDelta) || 0),
      reason: (data.reason as any) || "Manual",
      notes: data.description || data.notes || "",
      adjustedAt: data.adjustmentDate || new Date(),
      resultingStockOnHand: Number(item.resultingStockOnHand) || 0,
      resultingInventoryValue: Number(item.resultingInventoryValue) || 0,
    });
    results.push(adj);
  }
  return results;
}

export async function listAdjustments(organizationId: any) {
  return InventoryAdjustment.find({ organizationId })
    .sort({ adjustedAt: -1 })
    .lean();
}

export async function createPackage(organizationId: any, data: any) {
  return Package.create({
    organizationId,
    packageNumber: data.packageNumber || `PKG-${Date.now()}`,
    packageDate: data.packageDate || new Date(),
    salesOrderId: data.salesOrderId ? new Types.ObjectId(data.salesOrderId) : undefined,
    lineItems: data.lineItems || [],
    status: "Packed",
  } as any);
}

export async function listPackages(organizationId: any) {
  return Package.find({ organizationId, isDeleted: false })
    .sort({ packageDate: -1 })
    .lean();
}

export async function createMoveOrder(organizationId: any, data: any) {
  // MoveOrder uses: organizationId, orderNumber, date, fromWarehouseId, toWarehouseId, items[]
  return MoveOrder.create({
    organizationId,
    orderNumber: data.moveOrderNumber || data.orderNumber || `MV-${Date.now()}`,
    date: data.moveDate || new Date(),
    fromWarehouseId: new Types.ObjectId(data.fromWarehouseId),
    toWarehouseId: new Types.ObjectId(data.toWarehouseId),
    items: (data.lineItems || []).map((li: any) => ({
      itemId: new Types.ObjectId(li.itemId),
      quantity: Number(li.quantity) || 0,
    })),
    status: "Sent",
  } as any);
}

export async function listMoveOrders(organizationId: any) {
  return MoveOrder.find({ organizationId, isDeleted: false })
    .sort({ date: -1 })
    .lean();
}

export async function createPutaway(organizationId: any, data: any) {
  // Putaway requires purchaseReceiveId and purchaseReceiveNumber
  return Putaway.create({
    organizationId,
    putawayNumber: data.putawayNumber || `PA-${Date.now()}`,
    purchaseReceiveId: new Types.ObjectId(data.purchaseReceiveId || new Types.ObjectId()),
    purchaseReceiveNumber: data.purchaseReceiveNumber || `REC-${Date.now()}`,
    date: data.putawayDate || new Date(),
    warehouseId: new Types.ObjectId(data.warehouseId),
    lineItems: (data.lineItems || []).map((li: any) => ({
      itemId: new Types.ObjectId(li.itemId),
      name: li.name || "Item",
      quantityReceived: Number(li.quantity) || 0,
      quantityPutaway: Number(li.quantity) || 0,
      remainingQuantity: 0,
    })),
    notes: data.notes || "",
    status: "Completed",
  } as any);
}

export async function listPutaways(organizationId: any) {
  return Putaway.find({ organizationId, isDeleted: false })
    .sort({ date: -1 })
    .lean();
}

export async function listWarehouses(organizationId: any) {
  return Warehouse.find({ organizationId, isActive: true })
    .sort({ name: 1 })
    .lean();
}

export async function createWarehouse(organizationId: any, data: any) {
  // Warehouse uses: name, address (object), isPrimary, isActive — no separate 'code' field
  return Warehouse.create({
    organizationId,
    name: data.name,
    address: data.address || {},
    isPrimary: data.isPrimary || false,
    isActive: true,
  } as any);
}
