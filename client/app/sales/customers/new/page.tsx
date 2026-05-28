"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "../_components/customer-form";

export default function NewCustomerPage() {
  const router = useRouter();
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/sales/customers")}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span>
                Sales <span className="mx-1">/</span>
                Customers <span className="mx-1">/</span>
                <span className="font-medium text-foreground">New Customer</span>
              </span>
            </div>
          }
        />

        <div className="flex flex-1 flex-col p-6">
          <h1 className="text-xl font-bold">New Customer</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create customer with GST, accounts receivable and opening balance linkage.</p>

          <div className="mt-5">
            <CustomerForm
              mode="create"
              onCancel={() => {
                const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
                const redirectUrl = searchParams?.get("redirect");
                if (redirectUrl) {
                  router.push(redirectUrl);
                } else {
                  router.push("/sales/customers");
                }
              }}
              onSaved={(contact) => {
                const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
                const redirectUrl = searchParams?.get("redirect");
                if (redirectUrl) {
                  const url = new URL(redirectUrl, window.location.origin);
                  url.searchParams.set("newCustomerId", contact._id);
                  router.push(url.toString());
                } else {
                  router.push(`/sales/customers?selectedId=${contact._id}`);
                }
              }}
            />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
