"use client";

import { InventoryPlaceholder } from "@/app/inventory/_components/inventory-placeholder";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";

export default function InventoryMoveOrdersPage() {
  return (
    <InventoryShell title="Move Orders">
      <InventoryPlaceholder
        title="Move Orders"
        description="Inter-warehouse move order orchestration and transfer approvals."
      />
    </InventoryShell>
  );
}
