"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Package, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { itemApi, type Item } from "@/lib/api/items";

export default function ItemsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [items, setItems] = useState<Item[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "Goods" | "Service">("All");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, activeOrganization?._id]);

  async function fetchItems() {
    setFetching(true);
    try {
      const res = await itemApi.list({ page: 1, limit: 100 });
      setItems(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filtered = items.filter((i) => {
    const matchesType = typeFilter === "All" || i.itemType === typeFilter;
    const matchesSearch =
      !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku?.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={<span className="text-sm font-medium">Items</span>}
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchItems} disabled={fetching}>
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => router.push("/items/new")}>
                <Plus className="h-4 w-4 mr-1" />
                New Item
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Items</h1>
              <p className="text-sm text-muted-foreground">{filtered.length} items</p>
            </div>
            <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <TabsList>
                <TabsTrigger value="All">All</TabsTrigger>
                <TabsTrigger value="Goods">Goods</TabsTrigger>
                <TabsTrigger value="Service">Services</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
              <Package className="h-12 w-12 opacity-40" />
              <div className="text-center">
                <p className="font-medium">{search ? "No items match your search" : "No items yet"}</p>
                <p className="text-sm">Create your first item to get started.</p>
              </div>
              {!search && (
                <Button onClick={() => router.push("/items/new")}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Item
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Sales Price</TableHead>
                    <TableHead className="text-right">Purchase Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item._id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.sku || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.itemType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {typeof item.unit === "object" && item.unit
                          ? `${(item.unit as { name: string; abbreviation: string }).name} (${(item.unit as { name: string; abbreviation: string }).abbreviation})`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {item.sellingPrice != null ? `₹${item.sellingPrice.toLocaleString("en-IN")}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {item.costPrice != null ? `₹${item.costPrice.toLocaleString("en-IN")}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "default" : "secondary"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
