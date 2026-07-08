"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { CustomerForm } from "../../_components/customer-form";

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [initialData, setInitialData] = useState<Contact | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!id || !firebaseUser || loading) return;

    let cancelled = false;
    async function loadCustomer() {
      setFetching(true);
      setError("");
      try {
        const res = await contactApi.getById(id);
        if (!cancelled) setInitialData(res.data);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to load customer";
        if (!cancelled) {
          setError(message);
          setInitialData(null);
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    }

    void loadCustomer();

    return () => {
      cancelled = true;
    };
  }, [id, firebaseUser, loading]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
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
                onClick={() => router.push(id ? `/sales/customers?selectedId=${id}` : "/sales/customers")}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span>
                Sales <span className="mx-1">/</span>
                Customers <span className="mx-1">/</span>
                <span className="font-medium text-foreground">Edit Customer</span>
              </span>
            </div>
          }
        />

        <div className="flex flex-1 flex-col p-6">
          <h1 className="text-xl font-bold">Edit Customer</h1>
          {initialData?.displayName ? (
            <p className="mt-1 text-sm text-muted-foreground">{initialData.displayName}</p>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {fetching ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              Loading customer details...
            </div>
          ) : initialData ? (
            <div className="mt-5">
              <CustomerForm
                mode="edit"
                initialData={initialData}
                onCancel={() => router.push(id ? `/sales/customers?selectedId=${id}` : "/sales/customers")}
                onSaved={(contact) => {
                  router.push(`/sales/customers?selectedId=${contact._id}`);
                }}
              />
            </div>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
