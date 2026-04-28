"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InventoryPlaceholder } from "@/app/inventory/_components/inventory-placeholder";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";

export default function InventoryPutawaysPage() {
  return (
    <InventoryShell
      title="All Putaways"
      actions={
        <Button asChild size="sm">
          <Link href="/inventory/putaways/new">+ New</Link>
        </Button>
      }
    >
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-2xl font-semibold mb-2">Store Items to the Right Place</h2>
        <p className="text-muted-foreground mb-6">
          Assign received inventory to the correct storage locations.
        </p>
        <Button asChild className="bg-blue-500 hover:bg-blue-600">
          <Link href="/inventory/putaways/new">START PUTAWAY</Link>
        </Button>
      </div>
    </InventoryShell>
  );
}
