"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Building2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { contactApi, type Contact } from "@/lib/api/contacts";

export default function VendorsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) fetchContacts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading]);

  async function fetchContacts() {
    setFetching(true);
    try {
      const res = await contactApi.list({ type: "Vendor", page: 1, limit: 100 });
      setContacts(res.data ?? []);
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

  const filtered = contacts.filter(
    (c) =>
      !search ||
      c.displayName.toLowerCase().includes(search.toLowerCase()) ||
      c.companyName?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Vendors</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchContacts} disabled={fetching}>
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Vendor
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-4">
          <div>
            <h1 className="text-xl font-bold">Vendors</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} vendors</p>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
              <Building2 className="h-12 w-12 opacity-40" />
              <div className="text-center">
                <p className="font-medium">{search ? "No vendors match" : "No vendors yet"}</p>
                <p className="text-sm">Add your first vendor to get started.</p>
              </div>
              {!search && (
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  New Vendor
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Tax Treatment</TableHead>
                    <TableHead className="text-right">Opening Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c._id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">{c.displayName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.companyName || "—"}</TableCell>
                      <TableCell className="text-sm">{c.email || "—"}</TableCell>
                      <TableCell className="text-sm">{c.phone || c.mobile || "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{c.gstin || "—"}</TableCell>
                      <TableCell>
                        {c.taxTreatment ? (
                          <Badge variant="outline">{c.taxTreatment}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {c.openingBalance != null && c.openingBalance !== 0
                          ? `₹${c.openingBalance.toLocaleString("en-IN")}`
                          : "—"}
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
