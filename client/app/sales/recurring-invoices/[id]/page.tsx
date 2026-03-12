"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import {
  recurringInvoiceApi,
  type RecurringInvoice,
} from "@/lib/api/recurring-invoices";
import { toast } from "sonner";

const STATUS_STYLES: Record<RecurringInvoice["status"], string> = {
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

function customerEmail(customer: RecurringInvoice["customerId"]) {
  if (typeof customer === "string") return "-";
  return customer?.email || "-";
}

function paymentTermsLabel(value: RecurringInvoice["paymentTermsId"]) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  return value.name;
}

function salesPersonLabel(value: RecurringInvoice["salesPersonId"]) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  return value.name;
}

function activityLabel(activity: { message: string }) {
  return activity.message;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function RecurringInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [profile, setProfile] = useState<RecurringInvoice | null>(null);
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchProfile = useCallback(async () => {
    setFetching(true);
    try {
      const response = await recurringInvoiceApi.getById(id);
      setProfile(response.data);
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Failed to fetch recurring invoice profile"),
      );
    } finally {
      setFetching(false);
    }
  }, [id]);

  useEffect(() => {
    if (firebaseUser && !loading && id) {
      void fetchProfile();
    }
  }, [firebaseUser, loading, id, fetchProfile]);

  async function handleAction(
    action: "pause" | "resume" | "stop" | "delete" | "run",
  ) {
    if (!profile) return;

    setActionLoading(true);
    try {
      if (action === "delete") {
        const confirmed = window.confirm(`Delete ${profile.profileName}?`);
        if (!confirmed) {
          setActionLoading(false);
          return;
        }
        await recurringInvoiceApi.remove(profile._id);
        router.push("/sales/recurring-invoices");
        return;
      }

      if (action === "pause") {
        await recurringInvoiceApi.pause(profile._id);
      } else if (action === "resume") {
        await recurringInvoiceApi.resume(profile._id);
      } else if (action === "stop") {
        await recurringInvoiceApi.stop(profile._id);
      } else {
        const response = await recurringInvoiceApi.runNow(profile._id);
        toast.success(response.message || "Invoice created");
      }

      await fetchProfile();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Action failed"));
    } finally {
      setActionLoading(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 items-center justify-center">
            Profile not found.
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const generatedInvoices = profile.generatedInvoices || [];

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <button
                className="hover:underline"
                onClick={() => router.push("/sales/recurring-invoices")}
              >
                Recurring Invoices
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                {profile.profileName}
              </span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/sales/recurring-invoices")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {profile.profileName}
                </h1>
                <Badge
                  variant="outline"
                  className={STATUS_STYLES[profile.status]}
                >
                  {profile.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {customerName(profile.customerId)} ·{" "}
                {formatCurrency(profile.total)} ·{" "}
                {FREQUENCY_LABELS[profile.frequency]}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/sales/recurring-invoices/${profile._id}/edit`)
                }
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              {profile.status !== "completed" && profile.status !== "stopped" ?
                <Button
                  onClick={() => void handleAction("run")}
                  disabled={actionLoading}
                >
                  {actionLoading ?
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Plus className="mr-2 h-4 w-4" />}
                  Create Invoice
                </Button>
              : null}
              {profile.status === "active" ?
                <Button
                  variant="outline"
                  onClick={() => void handleAction("pause")}
                  disabled={actionLoading}
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </Button>
              : null}
              {profile.status === "paused" ?
                <Button
                  variant="outline"
                  onClick={() => void handleAction("resume")}
                  disabled={actionLoading}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </Button>
              : null}
              {profile.status !== "stopped" && profile.status !== "completed" ?
                <Button
                  variant="outline"
                  onClick={() => void handleAction("stop")}
                  disabled={actionLoading}
                >
                  <Square className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              : null}
              <Button variant="outline" onClick={() => void fetchProfile()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => void handleAction("delete")}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Invoice Amount</CardDescription>
                <CardTitle>{formatCurrency(profile.total)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Next Invoice Date</CardDescription>
                <CardTitle>{formatDate(profile.nextRunDate)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Recurring Period</CardDescription>
                <CardTitle>{FREQUENCY_LABELS[profile.frequency]}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Generated Invoices</CardDescription>
                <CardTitle>{profile.generatedInvoiceCount}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="next-invoice">Next Invoice</TabsTrigger>
              <TabsTrigger value="recent-activities">
                Recent Activities
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <Card>
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div>
                      <div className="font-medium">
                        {customerName(profile.customerId)}
                      </div>
                      <div className="text-muted-foreground">
                        {customerEmail(profile.customerId)}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Start Date
                        </span>
                        <span>{formatDate(profile.startDate)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">End Date</span>
                        <span>
                          {profile.neverExpires ?
                            "Never expires"
                          : formatDate(profile.endDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Payment Terms
                        </span>
                        <span>{paymentTermsLabel(profile.paymentTermsId)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Salesperson
                        </span>
                        <span>{salesPersonLabel(profile.salesPersonId)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Delivery Mode
                        </span>
                        <span>
                          {profile.deliveryMode === "send" ?
                            "Auto-send"
                          : "Draft"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          Last Invoice
                        </span>
                        <span>{formatDate(profile.lastRunDate)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Generated Invoices</CardTitle>
                    <CardDescription>
                      Child invoices created from this recurring profile.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {generatedInvoices.length === 0 ?
                      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                        No child invoices have been generated yet.
                      </div>
                    : <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">
                                Amount
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {generatedInvoices.map((invoice) => (
                              <TableRow
                                key={invoice._id}
                                className="cursor-pointer hover:bg-muted/40"
                                onClick={() =>
                                  router.push(`/sales/invoices/${invoice._id}`)
                                }
                              >
                                <TableCell className="font-medium text-blue-700">
                                  {invoice.invoiceNumber}
                                </TableCell>
                                <TableCell>
                                  {formatDate(invoice.invoiceDate)}
                                </TableCell>
                                <TableCell>{invoice.status}</TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(invoice.total)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    }
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="next-invoice">
              <Card>
                <CardHeader>
                  <CardTitle>Next Invoice Preview</CardTitle>
                  <CardDescription>
                    Preview of the template that will be used on the next
                    scheduled run.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Customer
                      </div>
                      <div className="font-medium">
                        {customerName(profile.customerId)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Invoice Date
                      </div>
                      <div className="font-medium">
                        {formatDate(profile.nextRunDate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Payment Terms
                      </div>
                      <div className="font-medium">
                        {paymentTermsLabel(profile.paymentTermsId)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Frequency
                      </div>
                      <div className="font-medium">
                        {FREQUENCY_LABELS[profile.frequency]}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.items.map((item) => (
                          <TableRow
                            key={item._id || `${item.name}-${item.quantity}`}
                          >
                            <TableCell>
                              <div className="font-medium">{item.name}</div>
                              {item.description ?
                                <div className="text-xs text-muted-foreground">
                                  {item.description}
                                </div>
                              : null}
                            </TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{formatCurrency(item.rate)}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-medium">
                          Customer Notes
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {profile.customerNotes || "-"}
                        </p>
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          Terms and Conditions
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {profile.termsAndConditions || "-"}
                        </p>
                      </div>
                    </div>

                    <Card>
                      <CardContent className="space-y-3 pt-6 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Subtotal
                          </span>
                          <span>{formatCurrency(profile.subTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Discount
                          </span>
                          <span>{formatCurrency(profile.discountAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Tax</span>
                          <span>{formatCurrency(profile.taxAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Adjustment
                          </span>
                          <span>
                            {formatCurrency(profile.adjustmentAmount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between font-semibold">
                          <span>Total</span>
                          <span>{formatCurrency(profile.total)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="recent-activities">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activities</CardTitle>
                  <CardDescription>
                    Schedule changes and generated invoice events for this
                    profile.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[...(profile.recentActivities || [])]
                      .slice()
                      .reverse()
                      .map((activity) => (
                        <div
                          key={`${activity.createdAt}-${activity.message}`}
                          className="rounded-lg border px-4 py-3"
                        >
                          <div className="text-sm font-medium">
                            {activityLabel(activity)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDate(activity.createdAt)}
                          </div>
                        </div>
                      ))}
                    {profile.recentActivities.length === 0 ?
                      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                        No activities recorded yet.
                      </div>
                    : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
