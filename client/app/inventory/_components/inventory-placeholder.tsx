"use client";

import Link from "next/link";
import { ArrowRight, Construction } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface InventoryPlaceholderProps {
  title: string;
  description: string;
}

export function InventoryPlaceholder({ title, description }: InventoryPlaceholderProps) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Construction className="h-4 w-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          This module shell is now part of Inventory navigation. Use Inventory Adjustments
          for stock correction workflows and the Inventory Overview for stock analysis.
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700 text-white">
            <Link href="/inventory/adjustments">
              Open Inventory Adjustments
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
            <Link href="/inventory">Open Inventory Overview</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
