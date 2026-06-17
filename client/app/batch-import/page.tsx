"use client";

import { useSearchParams } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import BulkOcrImport, { OcrDocType } from "@/components/bulk-ocr-import";
import React, { Suspense } from "react";

function BatchImportContent() {
  const searchParams = useSearchParams();
  const section = (searchParams.get("section") || "sales") as any;
  const defaultDocType = (searchParams.get("type") || "Invoices") as OcrDocType;
  const back = searchParams.get("back") || "";

  return (
    <BulkOcrImport
      open={true}
      onOpenChange={() => {}}
      section={section}
      defaultDocType={defaultDocType}
      isFullScreenPage={true}
      backUrl={back}
    />
  );
}

export default function BatchImportPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-hidden bg-white">
        <Suspense fallback={
          <div className="flex h-full items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
              <p className="text-xs text-slate-500 font-medium font-mono">Loading Import Workspace...</p>
            </div>
          </div>
        }>
          <BatchImportContent />
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}
