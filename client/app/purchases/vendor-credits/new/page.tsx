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
      <SidebarInset className="flex flex-col h-svh overflow-auto">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <a href="/purchases/vendor-credits" className="hover:text-foreground transition-colors">
                Vendor Credits
              </a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New</span>
            </span>
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
