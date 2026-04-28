import type {
  CreateMoveOrderInput,
  MoveOrder,
  MoveOrderStatus,
} from "@/lib/api/move-orders";

const STORAGE_KEY = "hai.inventory.move-orders.v1";

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function readRaw(): MoveOrder[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as MoveOrder[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row && typeof row._id === "string");
  } catch {
    return [];
  }
}

function writeRaw(rows: MoveOrder[]): void {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore storage errors
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function localId(): string {
  return `local-mo-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

export function listLocalMoveOrders(): MoveOrder[] {
  return readRaw().sort(
    (a, b) =>
      new Date(b.createdAt || b.moveDate).getTime() -
      new Date(a.createdAt || a.moveDate).getTime(),
  );
}

export function saveLocalMoveOrder(
  input: CreateMoveOrderInput,
  statusOverride?: MoveOrderStatus,
): MoveOrder {
  const existing = readRaw();
  const timestamp = nowIso();

  const created: MoveOrder = {
    _id: localId(),
    organizationId: "local",
    moveOrderNumber: input.moveOrderNumber,
    moveDate: input.moveDate,
    sourceWarehouseId: input.sourceWarehouseId,
    destinationWarehouseId: input.destinationWarehouseId,
    assigneeId: input.assigneeId || null,
    assigneeName: input.assigneeName,
    internalNotes: input.internalNotes,
    status: statusOverride || input.status || "Draft",
    lineItems: input.lineItems.map((row) => ({
      itemId: row.itemId,
      itemName: row.itemName,
      sku: row.sku,
      quantityTransferred: Number(row.quantityTransferred || 0),
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  writeRaw([created, ...existing]);
  return created;
}
