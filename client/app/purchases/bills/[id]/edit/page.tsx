"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BillForm } from "@/components/bill-form";
import { billApi, type Bill } from "@/lib/api/bills";
import { toast } from "sonner";

export default function EditBillPage() {
  const router = useRouter();
  const { id } = useParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      billApi.getOne(id as string)
        .then(res => {
          setBill(res.data);
          setLoading(false);
        })
        .catch(() => {
          toast.error("Failed to load bill");
          router.push("/purchases/bills");
        });
    }
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
              <a href="/purchases/bills" className="hover:text-foreground transition-colors">Bills</a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Edit</span>
            </span>
          }
        />
        {bill && (
          <BillForm
            mode="edit"
            initialData={bill}
            onSuccess={() => router.push("/purchases/bills")}
            onCancel={() => router.push("/purchases/bills")}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

