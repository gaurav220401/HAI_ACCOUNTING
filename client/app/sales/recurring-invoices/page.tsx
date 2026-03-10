"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import {
  recurringInvoiceApi,
  type RecurringInvoice,
  type RecurringInvoiceStatus,
} from "@/lib/api/recurring-invoices";
import { toast } from "sonner";

const STATUS_FILTERS: Array<RecurringInvoiceStatus | "All"> = [
  "All",
  "active",
  "paused",
  "stopped",
  "completed",
];

const STATUS_STYLES: Record<RecurringInvoiceStatus, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  stopped: "bg-red-50 text-red-700 border-red-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
};

const FREQUENCY_LABELS: Record<RecurringInvoice["frequency"], string> = {
  weekly: "Weekly",
  every_10_days: "Every 10 Days",
  every_15_days: "Every 15 Days",
  monthly: "Monthly",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function customerName(customer: RecurringInvoice["customerId"]) {
  if (typeof customer === "string") return customer;
  return customer?.displayName || customer?.companyName || "-";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function RecurringInvoicesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [profiles, setProfiles] = useState<RecurringInvoice[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RecurringInvoiceStatus | "All">(
    "All",
  );

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchProfiles = useCallback(async () => {
    setFetching(true);
    try {
      const response = await recurringInvoiceApi.list({
        status: statusFilter,
        page: 1,
        limit: 200,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setProfiles(response.data ?? []);
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Failed to fetch recurring invoice profiles"),
      );
    } finally {
      setFetching(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (firebaseUser && !loading) {
      void fetchProfiles();
    }
  }, [firebaseUser, loading, fetchProfiles]);

  async function handleAction(
    action: "pause" | "resume" | "stop" | "run" | "delete",
    profile: RecurringInvoice,
  ) {
    try {
      if (action === "delete") {
        const confirmed = window.confirm(
          `Delete recurring profile ${profile.profileName}?`,
        );
        if (!confirmed) return;
        await recurringInvoiceApi.remove(profile._id);
      } else if (action === "pause") {
        await recurringInvoiceApi.pause(profile._id);
      } else if (action === "resume") {
        await recurringInvoiceApi.resume(profile._id);
      } else if (action === "stop") {
        await recurringInvoiceApi.stop(profile._id);
      } else {
        const response = await recurringInvoiceApi.runNow(profile._id);
        toast.success(response.message || "Invoice created");
      }

      await fetchProfiles();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Action failed"));
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filteredProfiles = profiles.filter((profile) => {
    const value = search.trim().toLowerCase();
    if (!value) return true;
    return [profile.profileName, profile.referenceNumber, profile.orderNumber, customerName(profile.customerId)]
      .filter(Boolean)
      .some((entry) => String(entry).toLowerCase().includes(value));
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Recurring Invoices</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search recurring invoices..."
                  className="h-9 pl-8"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchProfiles()}>
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => router.push("/sales/recurring-invoices/new")}>
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Recurring Invoices</h1>
              <p className="text-sm text-muted-foreground">
                Automate invoice generation on weekly, 10-day, 15-day, or monthly schedules.
              </p>
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as RecurringInvoiceStatus | "All")
              }
            >
              <SelectTrigger className="w-full md:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "All" ? "All profiles" : status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredProfiles.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
              <div className="max-w-xl space-y-3">
                <h2 className="text-xl font-semibold">Create. Schedule. Repeat.</h2>
                <p className="text-sm text-muted-foreground">
                  Create recurring profiles that generate invoices automatically and keep your billing cadence on track.
                </p>
                <Button onClick={() => router.push("/sales/recurring-invoices/new")}>Create New Recurring Invoice</Button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Profile Name</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Last Invoice Date</TableHead>
                    <TableHead>Next Invoice Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfiles.map((profile) => (
                    <TableRow
                      key={profile._id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => router.push(`/sales/recurring-invoices/${profile._id}`)}
                    >
                      <TableCell>{customerName(profile.customerId)}</TableCell>
                      <TableCell className="font-medium text-blue-700">
                        {profile.profileName}
                      </TableCell>
                      <TableCell>{FREQUENCY_LABELS[profile.frequency]}</TableCell>
                      <TableCell>{formatDate(profile.lastRunDate)}</TableCell>
                      <TableCell>{formatDate(profile.nextRunDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[profile.status]}>
                          {profile.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(profile.total)}
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/sales/recurring-invoices/${profile._id}`)}>
                              View profile
                            </DropdownMenuItem>
                            {profile.status !== "completed" && profile.status !== "stopped" ? (
                              <DropdownMenuItem onClick={() => void handleAction("run", profile)}>
                                Create invoice now
                              </DropdownMenuItem>
                            ) : null}
                            {profile.status === "active" ? (
                              <DropdownMenuItem onClick={() => void handleAction("pause", profile)}>
                                Pause
                              </DropdownMenuItem>
                            ) : null}
                            {profile.status === "paused" ? (
                              <DropdownMenuItem onClick={() => void handleAction("resume", profile)}>
                                Resume
                              </DropdownMenuItem>
                            ) : null}
                            {profile.status !== "stopped" && profile.status !== "completed" ? (
                              <DropdownMenuItem onClick={() => void handleAction("stop", profile)}>
                                Stop
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => void handleAction("delete", profile)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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