"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BillForm } from "@/components/bill-form";

function NewBillPageContent() {
  const router = useRouter();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-auto bg-white">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Purchases</span>
              <span className="text-sm font-bold text-slate-900 leading-none mt-0.5">New Bill</span>
            </div>
          }
        />
        <BillForm
          mode="create"
          onSuccess={() => router.push("/purchases/bills")}
          onCancel={() => router.push("/purchases/bills")}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function NewBillPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading bill form...</div>}>
      <NewBillPageContent />
    </Suspense>
  );
}
