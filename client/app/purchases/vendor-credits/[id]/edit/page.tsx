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
      <SidebarInset className="flex flex-col h-svh overflow-auto">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <a href="/purchases/vendor-credits" className="hover:text-foreground transition-colors">
                Vendor Credits
              </a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Edit</span>
            </span>
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
