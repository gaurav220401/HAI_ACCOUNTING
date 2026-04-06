"use client";

import { InventoryPlaceholder } from "@/app/inventory/_components/inventory-placeholder";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";

export default function InventoryShipmentsPage() {
  return (
    <InventoryShell title="Shipments">
      <InventoryPlaceholder
        title="Shipments"
        description="Shipment execution module for dispatch tracking and fulfillment checkpoints."
      />
    </InventoryShell>
  );
}
