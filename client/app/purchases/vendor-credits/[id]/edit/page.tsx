"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { VendorCreditForm } from "@/components/vendor-credit-form";
import { vendorCreditApi, type VendorCredit } from "@/lib/api/vendor-credits";

export default function EditVendorCreditPage() {
  const router = useRouter();
  const { id } = useParams();
  const [data, setData] = useState<VendorCredit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    vendorCreditApi
      .getOne(id as string)
      .then((res) => {
        setData(res.data.credit);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load vendor credit");
        router.push("/purchases/vendor-credits");
      });
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-auto bg-white">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Purchases</span>
              <span className="text-sm font-bold text-slate-900 leading-none mt-0.5">Edit Credit Note</span>
            </div>
          }
        />
        {data && (
          <VendorCreditForm
            mode="edit"
            initialData={data}
            onSuccess={() => router.push("/purchases/vendor-credits")}
            onCancel={() => router.push("/purchases/vendor-credits")}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
