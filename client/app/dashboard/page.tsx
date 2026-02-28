"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileText, Receipt, TrendingUp } from "lucide-react";

const stats = [
  { title: "Total Revenue", value: "₹0.00", change: "+0%", icon: DollarSign, color: "text-green-600" },
  { title: "Pending Invoices", value: "0", change: "0 this month", icon: FileText, color: "text-blue-600" },
  { title: "Expenses", value: "₹0.00", change: "+0%", icon: Receipt, color: "text-red-500" },
  { title: "Net Profit", value: "₹0.00", change: "+0%", icon: TrendingUp, color: "text-purple-600" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { firebaseUser, dbUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  useEffect(() => {
    if (!loading) {
      if (!firebaseUser) { router.push("/login"); return; }
    }
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

  const firstName = dbUser?.name?.split(" ")[0] || firebaseUser.displayName?.split(" ")[0] || "there";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Welcome */}
          <div>
            <h1 className="text-2xl font-bold">Good day, {firstName}! 👋</h1>
            <p className="text-muted-foreground text-sm">
              Here&apos;s your financial overview for today.
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{s.title}</CardTitle>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.change}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Placeholder charts row */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Revenue Overview</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 items-center justify-center py-12 text-muted-foreground text-sm">
                Chart coming soon
              </CardContent>
            </Card>
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 items-center justify-center py-12 text-muted-foreground text-sm">
                No transactions yet
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
