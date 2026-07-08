"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { CreditNoteForm } from "@/components/credit-note-form";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { creditNoteApi, type CreditNote } from "@/lib/api/credit-notes";

export default function EditCreditNotePage() {
  const router = useRouter();
  const { id } = useParams();

  const [data, setData] = useState<CreditNote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    creditNoteApi
      .getOne(id as string)
      .then((res) => {
        setData(res.data.credit);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load credit note");
        router.push("/sales/credit-notes");
      });
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
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
              Sales <span className="mx-1">/</span>
              <a href="/sales/credit-notes" className="hover:text-foreground transition-colors">
                Credit Notes
              </a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Edit</span>
            </span>
          }
        />

        {data && (
          <CreditNoteForm
            mode="edit"
            initialData={data}
            onSuccess={() => router.push("/sales/credit-notes")}
            onCancel={() => router.push("/sales/credit-notes")}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
