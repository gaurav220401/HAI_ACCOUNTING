"use client";

import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BillForm } from "@/components/bill-form";

export default function NewBillPage() {
  const router = useRouter();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-gray-50/50">
        <div className="flex-1 flex flex-col min-h-screen">
          <BillForm 
            mode="create"
            onSuccess={() => router.push("/purchases/bills")}
            onCancel={() => router.push("/purchases/bills")}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
