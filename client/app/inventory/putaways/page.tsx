"use client";

import { InventoryPlaceholder } from "@/app/inventory/_components/inventory-placeholder";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";

export default function InventoryPutawaysPage() {
  return (
    <InventoryShell title="Putaways">
      <InventoryPlaceholder
        title="Putaways"
        description="Inbound putaway planning for assigning received stock into storage locations."
      />
    </InventoryShell>
  );
}
