import Item from "../../models/item.model";
import ItemGroup from "../../models/item-group.model";
import UnitOfMeasurement from "../../models/unit.model";
import Warehouse from "../../models/warehouse.model";
import { Types } from "mongoose";
import * as XLSX from "xlsx";

export async function listItems(organizationId: any, limit = 100) {
  return Item.find({ organizationId, isDeleted: false })
    .populate("unit")
    .populate("itemGroupId")
    .sort({ name: 1 })
    .limit(limit)
    .lean();
}

export async function getItemById(organizationId: any, itemId: any) {
  return Item.findOne({ _id: itemId, organizationId, isDeleted: false })
    .populate("unit")
    .populate("itemGroupId")
    .lean();
}

export async function createItem(organizationId: any, data: any) {
  return Item.create({
    organizationId,
    name: data.name,
    itemType: data.itemType || "Goods",
    sku: data.sku || "",
    sellingPrice: Number(data.sellingPrice) || 0,
    costPrice: Number(data.costPrice) || 0,
    description: data.description || "",
    unit: data.unit ? new Types.ObjectId(data.unit) : null,
    itemGroupId: data.itemGroupId ? new Types.ObjectId(data.itemGroupId) : null,
    isActive: true,
  });
}

export async function updateItem(organizationId: any, itemId: any, data: any) {
  const updates: any = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.itemType !== undefined) updates.itemType = data.itemType;
  if (data.sku !== undefined) updates.sku = data.sku;
  if (data.sellingPrice !== undefined) updates.sellingPrice = Number(data.sellingPrice);
  if (data.costPrice !== undefined) updates.costPrice = Number(data.costPrice);
  if (data.description !== undefined) updates.description = data.description;
  if (data.unit !== undefined) updates.unit = data.unit ? new Types.ObjectId(data.unit) : null;
  if (data.itemGroupId !== undefined) updates.itemGroupId = data.itemGroupId ? new Types.ObjectId(data.itemGroupId) : null;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  return Item.findOneAndUpdate(
    { _id: itemId, organizationId, isDeleted: false },
    { $set: updates },
    { new: true }
  ).lean();
}

export async function searchItems(organizationId: any, query: string) {
  const cleanQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  return Item.find({
    organizationId,
    isDeleted: false,
    $or: [
      { name: { $regex: cleanQuery, $options: "i" } },
      { sku: { $regex: cleanQuery, $options: "i" } },
    ],
  })
    .limit(10)
    .lean();
}

export function getItemFormSchema() {
  return {
    type: "object",
    properties: {
      name: { type: "string", description: "Product or service name", required: true },
      itemType: { type: "string", enum: ["Goods", "Service"], default: "Goods", required: true },
      sku: { type: "string", description: "Stock Keeping Unit unique identifier" },
      sellingPrice: { type: "number", description: "Item selling rate to customers" },
      costPrice: { type: "number", description: "Cost rate from vendor purchases" },
      unit: { type: "string", description: "Unit of Measurement ObjectId" },
      description: { type: "string", description: "Item description context" },
    },
  };
}

export async function exportItemsToExcel(organizationId: any): Promise<Buffer> {
  const items = await Item.find({ organizationId, isDeleted: false }).lean();
  const rows = items.map((item) => ({
    Name: item.name,
    "Item Type": item.itemType,
    SKU: item.sku || "N/A",
    "Selling Price": item.sellingPrice || 0,
    "Cost Price": item.costPrice || 0,
    Stock: item.stockOnHand || 0,
    Status: item.isActive ? "Active" : "Inactive",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Items");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return buffer;
}

export async function listItemGroups(organizationId: any) {
  return ItemGroup.find({ organizationId, isActive: true }).lean();
}

export async function listUnits(organizationId: any) {
  return UnitOfMeasurement.find({ organizationId, isActive: true }).lean();
}
