"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { itemApi, type Item } from "@/lib/api/items";
import { ItemForm } from "@/app/items/_components/item-form";

export default function EditItemPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();
  const [item, setItem] = useState<Item | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => { if (!loading && !firebaseUser) router.push("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!firebaseUser || loading) return;
    itemApi.getById(id)
      .then((res) => setItem(res.data))
      .catch(() => router.push("/items"))
      .finally(() => setFetching(false));
  }, [id, firebaseUser, loading, router]);

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <ItemForm initialData={item ?? undefined} isEdit />
      </SidebarInset>
    </SidebarProvider>
  );
}
