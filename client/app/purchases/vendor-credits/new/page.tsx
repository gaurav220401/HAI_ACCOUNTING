"use client";

import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { VendorCreditForm } from "@/components/vendor-credit-form";

export default function NewVendorCreditPage() {
  const router = useRouter();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-auto bg-white">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Purchases</span>
              <span className="text-sm font-bold text-slate-900 leading-none mt-0.5">New Credit Note</span>
            </div>
          }
        />
        <VendorCreditForm
          mode="create"
          onSuccess={() => router.push("/purchases/vendor-credits")}
          onCancel={() => router.push("/purchases/vendor-credits")}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
