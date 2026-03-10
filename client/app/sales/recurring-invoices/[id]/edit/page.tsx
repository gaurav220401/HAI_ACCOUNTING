"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { RecurringInvoiceForm } from "../../_components/recurring-invoice-form";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";

export default function EditRecurringInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <button className="hover:underline" onClick={() => router.push("/sales/recurring-invoices")}>
                Recurring Invoices
              </button>
              <span className="mx-1">/</span>
              <button
                className="hover:underline"
                onClick={() => router.push(`/sales/recurring-invoices/${id}`)}
              >
                Profile
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Edit</span>
            </span>
          }
          actions={
            <Button variant="ghost" size="sm" onClick={() => router.push(`/sales/recurring-invoices/${id}`)}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Edit Recurring Invoice</h1>
            <p className="text-sm text-muted-foreground">
              Update the billing template, schedule, or delivery mode for this profile.
            </p>
          </div>
          <RecurringInvoiceForm mode="edit" recurringId={id} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}