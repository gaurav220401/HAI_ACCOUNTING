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
      <SidebarInset className="flex flex-col h-svh overflow-auto bg-white">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Purchases</span>
              <span className="text-sm font-bold text-slate-900 leading-none mt-0.5">New Recurring Bill</span>
            </div>
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
