import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import Item from "../models/item.model";
import Organization from "../models/organization.model";
import Warehouse from "../models/warehouse.model";
import StockBalance from "../models/stock-balance.model";
import StockMovement from "../models/stock-movement.model";
import { roundMoney } from "../utils/money";

/**
 * Backfills StockBalance / StockMovement from the existing Item.stockOnHand
 * scalar. See docs/STOCK_LEDGER_SPEC.md §7.
 *
 * Idempotent and re-runnable: items that already have balance rows are skipped,
 * so it is safe to run repeatedly during rollout and safe to run after the
 * ledger has been live (the service seeds lazily too).
 *
 *   npm run backfill:stock            # apply
 *   npm run backfill:stock -- --dry   # report only
 */

const DRY = process.argv.includes("--dry") || process.argv.includes("--dry-run");

function round2(n: unknown): number {
  return roundMoney(Number(n) || 0);
}

async function ensurePrimaryWarehouse(orgId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId | null> {
  const primary = await Warehouse.findOne({ organizationId: orgId, isDeleted: false, isPrimary: true }).select("_id").lean();
  if (primary) return (primary as { _id: mongoose.Types.ObjectId })._id;

  const any = await Warehouse.findOne({ organizationId: orgId, isDeleted: false }).select("_id").lean();
  if (any) {
    if (!DRY) {
      await Warehouse.updateOne({ _id: (any as { _id: mongoose.Types.ObjectId })._id }, { $set: { isPrimary: true } });
    }
    console.log(`   promoted existing warehouse to primary`);
    return (any as { _id: mongoose.Types.ObjectId })._id;
  }

  if (DRY) {
    console.log(`   would create a "Main" warehouse`);
    return null;
  }

  const created = await Warehouse.create({
    organizationId: orgId,
    name: "Main",
    isPrimary: true,
    isActive: true,
  });
  console.log(`   created "Main" warehouse`);
  return created._id as mongoose.Types.ObjectId;
}

async function run() {
  await connectDB();
  console.log(DRY ? "\n=== DRY RUN — nothing will be written ===\n" : "\n=== BACKFILL STOCK LEDGER ===\n");

  const orgs = await Organization.find({ isDeleted: false }).select("_id name").lean();
  let seeded = 0;
  let skipped = 0;
  const drift: Array<{ item: string; scalar: number; balances: number }> = [];

  for (const org of orgs) {
    const orgId = (org as { _id: mongoose.Types.ObjectId })._id;
    console.log(`\n▸ ${(org as { name?: string }).name || orgId}`);

    const warehouseId = await ensurePrimaryWarehouse(orgId);
    if (!warehouseId) {
      console.log("   skipped — no warehouse available");
      continue;
    }

    const items = await Item.find({
      organizationId: orgId,
      isDeleted: false,
      inventoryTracked: true,
    })
      .select("name stockOnHand committedStock inventoryValue averageCost warehouseId")
      .lean();

    for (const item of items as Array<Record<string, any>>) {
      const existing = await StockBalance.countDocuments({ organizationId: orgId, itemId: item._id });

      if (existing > 0) {
        // Already migrated — verify instead of rewriting.
        const agg = await StockBalance.aggregate([
          { $match: { organizationId: orgId, itemId: item._id } },
          { $group: { _id: null, qty: { $sum: "$quantity" } } },
        ]);
        const summed = round2(agg[0]?.qty || 0);
        const scalar = round2(item.stockOnHand);
        if (Math.abs(summed - scalar) > 0.01) {
          drift.push({ item: item.name, scalar, balances: summed });
        }
        skipped += 1;
        continue;
      }

      const qty = round2(item.stockOnHand);
      const value = round2(item.inventoryValue);
      const cost = round2(item.averageCost);
      const target = item.warehouseId || warehouseId;

      if (DRY) {
        seeded += 1;
        continue;
      }

      await StockBalance.create({
        organizationId: orgId,
        itemId: item._id,
        warehouseId: target,
        batchId: null,
        quantity: qty,
        committedQuantity: round2(item.committedStock),
        averageCost: cost,
        value: value || round2(qty * cost),
      });

      if (Math.abs(qty) > 0.0001) {
        await StockMovement.create({
          organizationId: orgId,
          itemId: item._id,
          warehouseId: target,
          batchId: null,
          quantityDelta: qty,
          valueDelta: value || round2(qty * cost),
          resultingQuantity: qty,
          resultingValue: value || round2(qty * cost),
          sourceType: "Opening",
          sourceId: `opening:${String(item._id)}`,
          sourceNumber: "",
          notes: "Opening balance migrated from Item.stockOnHand",
          movedAt: new Date(),
        });
      }

      seeded += 1;
    }

    console.log(`   ${items.length} tracked item(s)`);
  }

  console.log(`\n${"─".repeat(58)}`);
  console.log(`seeded : ${seeded}`);
  console.log(`skipped: ${skipped} (already had balance rows)`);

  if (drift.length > 0) {
    // Pre-existing inconsistency, surfaced rather than introduced — the scalar
    // and the ledger disagree, and someone has to decide which is right.
    console.log(`\n⚠ ${drift.length} item(s) where Item.stockOnHand disagrees with the ledger:`);
    for (const d of drift.slice(0, 25)) {
      console.log(`   ${d.item}: item says ${d.scalar}, balances sum to ${d.balances}`);
    }
    if (drift.length > 25) console.log(`   … and ${drift.length - 25} more`);
  } else {
    console.log("\n✓ no drift detected");
  }

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error("backfill failed:", err);
  await mongoose.connection.close().catch(() => undefined);
  process.exit(1);
});
