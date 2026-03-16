"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
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
      <SidebarInset className="bg-gray-50/50">
        <div className="flex-1 flex flex-col min-h-screen">
          {bill && (
            <BillForm 
              mode="edit"
              initialData={bill}
              onSuccess={() => router.push("/purchases/bills")}
              onCancel={() => router.push("/purchases/bills")}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

