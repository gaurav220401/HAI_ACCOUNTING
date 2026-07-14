import mongoose from "mongoose";
import Item from "../../models/item.model";

export async function createItemTool(
  organizationId: string,
  args: {
    name: string;
    itemType?: "Goods" | "Service";
    sku?: string;
    sellingPrice?: number;
    purchasePrice?: number;
    stockOnHand?: number;
    reorderPoint?: number;
    hsnSacCode?: string;
    description?: string;
  }
) {
  if (!args.name) {
    throw new Error("Item name is required to create an item.");
  }

  const existing = await Item.findOne({
    organizationId,
    name: new RegExp(`^${args.name.trim()}$`, "i"),
    isDeleted: false,
  });

  if (existing) {
    return {
      alreadyExists: true,
      itemId: existing._id,
      name: existing.name,
      message: `Item "${existing.name}" already exists in inventory.`,
    };
  }

  const newItem = await Item.create({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    name: args.name.trim(),
    itemType: args.itemType || "Goods",
    sku: args.sku ? args.sku.trim().toUpperCase() : "",
    sellingPrice: args.sellingPrice ?? 0,
    costPrice: args.purchasePrice ?? 0,
    inventoryTracked: (args.itemType || "Goods") === "Goods",
    stockOnHand: args.stockOnHand ?? 0,
    reorderPoint: args.reorderPoint ?? 5,
    hsnSacCode: args.hsnSacCode || "",
    description: args.description || "",
  });

  return {
    success: true,
    itemId: newItem._id,
    name: newItem.name,
    sku: newItem.sku,
    sellingPrice: newItem.sellingPrice,
    stockOnHand: newItem.stockOnHand,
    message: `Inventory item "${newItem.name}" created successfully.`,
  };
}

export async function searchItemsTool(
  organizationId: string,
  args: { query?: string }
) {
  const filter: any = { organizationId, isDeleted: false };
  if (args.query) {
    filter.$or = [
      { name: { $regex: args.query, $options: "i" } },
      { sku: { $regex: args.query, $options: "i" } },
    ];
  }

  const items = await Item.find(filter)
    .limit(10)
    .select("name sku itemType sellingPrice stockOnHand reorderPoint")
    .lean();

  return {
    count: items.length,
    items,
  };
}
