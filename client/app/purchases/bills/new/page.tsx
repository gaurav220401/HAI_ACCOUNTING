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
      <SidebarInset className="flex flex-col h-svh overflow-auto">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <a href="/purchases/bills" className="hover:text-foreground transition-colors">Bills</a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New</span>
            </span>
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
