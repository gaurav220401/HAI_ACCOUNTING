"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { VendorForm } from "../_components/vendor-form";
import { contactApi, type Contact } from "@/lib/api/contacts";

export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [vendor, setVendor] = useState<Contact | null>(null);
  const [fetching, setFetching] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!firebaseUser || loading) return;
    const id = params?.id;
    if (!id) { setNotFound(true); setFetching(false); return; }

    contactApi.getById(id)
      .then((res) => {
        const data = (res as any).data ?? res;
        setVendor(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setFetching(false));
  }, [firebaseUser, loading, params]);

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2">
        <p className="text-lg font-medium">Vendor not found</p>
        <button
          className="text-sm text-primary underline"
          onClick={() => router.push("/purchases/vendors")}
        >
          Back to Vendors
        </button>
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
              Purchases <span className="mx-1">/</span>
              <a href="/purchases/vendors" className="hover:underline">Vendors</a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">{vendor?.displayName ?? "Edit Vendor"}</span>
            </span>
          }
        />
        {vendor && <VendorForm initialData={{ ...vendor, _id: vendor._id }} />}
      </SidebarInset>
    </SidebarProvider>
  );
}
