"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { useRouter } from "next/navigation";
import { RecurringBillForm } from "@/components/recurring-bill-form";

export default function NewRecurringBillPage() {
  const router = useRouter();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-auto">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <a href="/purchases/recurring-bills" className="hover:text-foreground transition-colors">Recurring Bills</a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New</span>
            </span>
          }
        />
        <RecurringBillForm
          mode="create"
          onSuccess={() => router.push("/purchases/recurring-bills")}
          onCancel={() => router.push("/purchases/recurring-bills")}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
