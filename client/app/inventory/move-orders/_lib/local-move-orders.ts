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
      new Date(b.createdAt || b.date).getTime() -
      new Date(a.createdAt || a.date).getTime(),
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
    orderNumber: input.orderNumber,
    date: input.date,
    fromWarehouseId: input.fromWarehouseId,
    toWarehouseId: input.toWarehouseId,
    status: statusOverride || input.status || "Draft",
    items: input.items.map((row) => ({
      itemId: row.itemId,
      quantity: Number(row.quantity || 0),
    })),
    referenceNumber: input.referenceNumber,
    notes: input.notes,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  writeRaw([created, ...existing]);
  return created;
}
