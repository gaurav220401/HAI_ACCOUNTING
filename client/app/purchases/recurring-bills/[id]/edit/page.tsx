"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { RecurringBillForm } from "@/components/recurring-bill-form";
import { recurringBillApi, type RecurringBill } from "@/lib/api/recurring-bills";

export default function EditRecurringBillPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [rec, setRec] = useState<RecurringBill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    recurringBillApi
      .getById(params.id)
      .then((res) => setRec(res.data))
      .catch(() => {
        toast.error("Failed to load recurring bill");
        router.push("/purchases/recurring-bills");
      })
      .finally(() => setLoading(false));
  }, [params?.id, router]);

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
              <a href="/purchases/recurring-bills" className="hover:text-foreground transition-colors">Recurring Bills</a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Edit</span>
            </span>
          }
        />
        {rec && (
          <RecurringBillForm
            mode="edit"
            initialData={rec}
            onSuccess={() => router.push("/purchases/recurring-bills")}
            onCancel={() => router.push("/purchases/recurring-bills")}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
