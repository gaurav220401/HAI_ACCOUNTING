"use client";

import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { CreditNoteForm } from "@/components/credit-note-form";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function NewCreditNotePage() {
  const router = useRouter();

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
              <span className="font-medium text-foreground">New</span>
            </span>
          }
        />

        <CreditNoteForm
          mode="create"
          onSuccess={() => router.push("/sales/credit-notes")}
          onCancel={() => router.push("/sales/credit-notes")}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
