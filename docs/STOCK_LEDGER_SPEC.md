# Spec — Per-Warehouse & Batch Stock

**Status:** proposed · **Scope:** backend data model + stock mutation paths · **Author:** reverse-engineered from `backend/src`

Stock is currently a single number on the item. This spec turns it into rows, so the
system can answer *how much of this, where, and from which batch* — and so batch/expiry
tracking becomes possible without a second migration.

---

## 1. What is broken today

### 1.1 Stock has no location

`Item.stockOnHand` is one scalar. `Item.warehouseId` is a single ref — an item can only
ever "belong to" one warehouse.

The consequences are already in the code, stated plainly:

```js
// backend/src/controllers/move-order.controller.ts:125
// Since stockOnHand is global, the net effect on global stock is 0,
// but it creates the necessary audit lineage.
```

A completed inter-warehouse transfer writes two `InventoryAdjustment` audit rows and
changes **no balance**. `Putaway` sets `item.warehouseId` only when it is unset
(`putaway.controller.ts:215`), so putting the same item away at a second location
silently does nothing.

The `Warehouse` model, `MoveOrder` with its full Draft → Sent → In Transit → Received
lifecycle, and warehouse-wise reporting are all built on a foundation that cannot
represent them.

### 1.2 The movement ledger is incomplete

`InventoryAdjustment` looks like a movement ledger but only four paths write to it:

| Writer | Location |
|---|---|
| Manual adjustment | `inventory.controller.ts:512` |
| Move order received | `move-order.controller.ts:133, 149` |
| Putaway | `putaway.controller.ts:221` |
| Sales-order shipment | `sales-order.controller.ts:776, 822` |

**Invoices and bills — the two highest-volume paths — mutate stock with no movement row
at all.** `applyStockDeltas()` sets `item.stockOnHand` and saves. There is no way to
reconstruct how a balance was reached, and no way to detect drift.

### 1.3 No batch or expiry

Nothing anywhere. Pharma, food, cosmetics and agri-chem cannot use the product, and
recall/FSSAI obligations cannot be met.

### 1.4 FIFO is unimplementable

`computeInvoiceCostLines()` costs every issue at `Item.averageCost`. There are no cost
layers for FIFO to draw on — which is why FIFO is currently rejected at the API edge.
Batches are cost layers; this change is what makes FIFO possible later.

---

## 2. The decision

**Stock becomes rows keyed `(item × warehouse × batch)`, with an append-only movement
ledger behind it. `Item.stockOnHand` survives as a maintained rollup.**

That last clause is what makes this a contained change rather than a rewrite — see §4.

Two new collections, mirroring the pattern this codebase already uses for the general
ledger (`GlEntry` movements + `Account.balance` rollup + reports aggregating movements):

```
StockMovement   append-only truth   ── every quantity change, ever
StockBalance    materialized        ── current quantity per (item, warehouse, batch)
Batch           optional dimension  ── lot number, expiry, received date
```

---

## 3. Data model

### 3.1 `StockBalance`

The hot-path read. One row per stocked combination.

| Field | Type | Notes |
|---|---|---|
| `organizationId` | ObjectId | required, indexed |
| `itemId` | ObjectId → Item | required |
| `warehouseId` | ObjectId → Warehouse | required |
| `batchId` | ObjectId → Batch \| null | null when the item is not batch-tracked |
| `quantity` | Number | on hand at this location/batch |
| `committedQuantity` | Number | reserved by approved sales orders |
| `averageCost` | Number | per-unit, per row — a batch is a cost layer |
| `value` | Number | `quantity × averageCost`, maintained |

**Unique index:** `(organizationId, itemId, warehouseId, batchId)` — partial on
`isDeleted: false`. This is the concurrency guard; upserts key on it.

### 3.2 `StockMovement`

Append-only. Never updated, never deleted — corrections are new opposing rows, exactly
as `GlEntry` reversals work.

| Field | Type | Notes |
|---|---|---|
| `organizationId` | ObjectId | required, indexed |
| `itemId` / `warehouseId` / `batchId` | refs | the balance row this affected |
| `quantityDelta` | Number | signed |
| `valueDelta` | Number | signed |
| `resultingQuantity` | Number | balance after — makes the row self-describing |
| `sourceType` | enum | `Invoice · Bill · CreditNote · VendorCredit · PurchaseReceive · Putaway · MoveOrder · Adjustment · Opening · Shipment` |
| `sourceId` | String | `<type>:<objectId>`, matching the `GlEntry.voucherId` convention |
| `sourceNumber` | String | human reference |
| `movedAt` | Date | indexed with org |

> **Deliberate:** `sourceId` is a string discriminated by `sourceType`, consistent with
> `GlEntry`. It is not populatable — see the note in §8.

### 3.3 `Batch`

| Field | Type | Notes |
|---|---|---|
| `organizationId` / `itemId` | refs | required |
| `batchNumber` | String | required; unique per `(org, item)` |
| `expiryDate` | Date \| null | indexed — drives expiry reporting and FEFO |
| `manufactureDate` | Date \| null | |
| `receivedAt` | Date | for FIFO ordering |
| `initialQuantity` | Number | for traceability |

### 3.4 Changes to `Item`

| Field | Change |
|---|---|
| `stockOnHand` | **keep** — now a maintained rollup, `sum(StockBalance.quantity)` |
| `committedStock` | **keep** — rollup of `committedQuantity` |
| `inventoryValue` | **keep** — rollup of `value` |
| `averageCost` | **keep** — weighted across balance rows |
| `warehouseId` | **deprecate** — becomes "default warehouse for new receipts" only |
| `batchTracked` | **new** `Boolean`, default `false` |
| `expiryTracked` | **new** `Boolean`, default `false` (requires `batchTracked`) |

---

## 4. Why `Item.stockOnHand` stays

This is the load-bearing decision.

There are roughly **100 read sites** for `Item.stockOnHand` — seven in
`report.controller.ts` alone, plus the item list, low-stock queries, the chatbot context
builder, item detail metrics, and every availability check. Migrating all of them at once
would be a multi-week change with no safe intermediate state.

Keeping the rollup means:

- Every existing reader keeps working, unchanged, throughout the migration
- Per-warehouse detail is **additive** — new screens read `StockBalance`; old screens keep
  reading the rollup
- The rollup is maintained inside the same transaction as the balance write, so it cannot
  drift silently
- A reconcile job (§7) can prove rollup == sum(balances) == sum(movements)

The trade is one denormalised field to keep honest, in exchange for a change that can ship
incrementally. Worth it.

---

## 5. Blast radius

Stock mutation is already **~85% centralized**, which is why this is feasible.

### 5.1 The chokepoint — `services/accounting-sync.service.ts`

Six functions carry almost all stock writes:

```
applyStockDeltas               applyInventoryValueDeltas
applyCommittedStockDeltas      applyInvoiceCostLines
applyStockAndCommitmentDeltas  fulfillSalesOrderStock
```

They share one type that must gain a dimension:

```ts
// today — no location, no batch
export type StockDeltaMap = Record<string, number>;   // itemId -> qty

// target
export interface StockDelta {
  itemId: string;
  warehouseId: string;
  batchId?: string | null;
  quantity: number;
  unitCost?: number;
}
export type StockDeltaList = StockDelta[];
```

Callers of these six functions:

| Caller | Call sites |
|---|---|
| `sales-order.controller.ts` | 10 |
| `invoice-accounting.service.ts` | 8 |
| `bill-accounting.service.ts` | 5 |
| `bill.controller.ts` | 4 |
| `inventory.controller.ts` | 4 |
| `credit-note.controller.ts` | 3 |
| `purchase-order.controller.ts` | 2 |
| `invoice.controller.ts` | 1 |

Each needs to supply a warehouse. Where a document has none, fall back to the org's
default warehouse (§6.2).

### 5.2 Bypass paths — must be closed

These write `Item.stockOnHand` directly, skipping the chokepoint:

| Location | What it does |
|---|---|
| `purchase-receive.controller.ts:64` | `item.stockOnHand = round2(prevStock + qty)` |
| `item.controller.ts:774–785, 863–867` | opening stock on create/update |
| `item.controller.ts:1321` | opening stock on CSV import |
| `inventory-opening.service.ts` | opening balance migration |

All four become `Opening` or `PurchaseReceive` movements through the chokepoint.

### 5.3 Reads that stay unchanged

Everything reading `Item.stockOnHand` — including all of `report.controller.ts` — keeps
working via the rollup. No change required in phase 1.

---

## 6. Behaviour decisions

### 6.1 Batch is optional, not mandatory

`batchId: null` is a first-class value. An item with `batchTracked: false` has exactly one
balance row per warehouse, with `batchId: null`. No existing workflow changes.

This is precisely why batch ships with per-warehouse rather than after it: adding the
dimension now costs one nullable column; adding it later costs a second migration over the
same rows.

### 6.2 Every movement needs a warehouse

Documents that do not currently carry one fall back to:
`document.warehouseId` → `item.warehouseId` → org default warehouse → the sole warehouse
if only one exists → **reject with a clear error**.

The org default is a new setting; the migration seeds it with the existing primary
warehouse.

### 6.3 Issue policy — which row is consumed

When stock leaves and the item is batch-tracked, pick by **FEFO** (first-expiry-first-out)
where `expiryDate` exists, else FIFO by `receivedAt`. Manual batch selection overrides.

For non-batch items there is one row per warehouse; no choice to make.

### 6.4 Negative stock

Allowed, but recorded and flagged — blocking it would break existing flows that post
invoices before receipts land. Add `allowNegativeStock` (default `true`) per organization
so a business can tighten it later.

### 6.5 Costing

Unchanged in this phase: weighted average, now computed per balance row. FIFO remains
rejected at the API edge. Once batches exist, each batch is a cost layer and FIFO becomes
a follow-up worth doing — that is the payoff, not part of this change.

---

## 7. Migration

Backfill is derivable, because current stock is a single number per item.

1. Ensure every org has at least one warehouse; create "Main" where absent, mark primary.
2. For each item with `inventoryTracked: true`, create one `StockBalance` row:
   `warehouseId = item.warehouseId ?? org primary`, `batchId = null`,
   `quantity = item.stockOnHand`, `averageCost = item.averageCost`,
   `value = item.inventoryValue`.
3. Write one `Opening` movement per row carrying the same figures, so the ledger explains
   the starting balance rather than beginning mid-air.
4. Recompute rollups and assert `item.stockOnHand == sum(balances)` for every item.
5. Report any item where they disagree — that is pre-existing drift, surfaced for the
   first time rather than created by the migration.

Idempotent and re-runnable; safe to run repeatedly during rollout.

### 7.1 Reconcile job

A scheduled check asserting, per item:

```
Item.stockOnHand == Σ StockBalance.quantity == Σ StockMovement.quantityDelta
```

Any mismatch is logged with the item and the three figures. This is the safety net that
makes a maintained rollup acceptable.

---

## 8. Deliberately out of scope

| Deferred | Why |
|---|---|
| **Serial numbers** | Different shape — one row per unit, not a quantity. Batch covers the compliance-critical cases first |
| **FIFO costing** | Needs batches to exist. Follow-up, once this is stable |
| **Bin/rack locations** | Another dimension below warehouse; same pattern, add when asked |
| **Migrating the ~100 rollup readers** | The rollup exists precisely so this is unnecessary |
| **`sourceId` as a real ref** | Kept as a discriminated string for consistency with `GlEntry`. Worth fixing across both, together, later |

---

## 9. Phasing

| Phase | Contents | Ships |
|---|---|---|
| **1** | `StockBalance`, `StockMovement`, `Batch` models; warehouse-aware chokepoint; rollup maintenance; migration script | independently — no UI change, no behaviour change |
| **2** | Close the four bypass paths; make move orders and putaway actually move stock | independently |
| **3** | Batch/expiry on the item form and receipt flows; FEFO issue policy | independently |
| **4** | Per-warehouse and batch/expiry reporting; expiry alerts | independently |

Phase 1 is invisible to users and reversible: balances are written and maintained, but
every read still comes from the rollup. That is the point — it can be verified in
production against the reconcile job before anything depends on it.

---

## 10. Decisions needed before phase 2

1. **Negative stock** — is `allowNegativeStock: true` the right default for your users?
2. **Default warehouse** — per organization, or per document type?
3. **Batch numbering** — user-entered, or auto-generated per receipt?
4. **Existing drift** — if migration finds items where `stockOnHand` disagrees with the
   sum, do we trust the item figure or the movements?
