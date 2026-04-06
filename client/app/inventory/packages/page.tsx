"use client";

import { InventoryPlaceholder } from "@/app/inventory/_components/inventory-placeholder";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";

export default function InventoryPackagesPage() {
  return (
    <InventoryShell title="Packages">
      <InventoryPlaceholder
        title="Packages"
        description="Package planning surface for grouped item dispatch workflows."
      />
    </InventoryShell>
  );
}
