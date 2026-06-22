"use client";
import Link from "next/link";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Shield,
  Cpu,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Send,
  Building,
  RefreshCw,
  TrendingUp,
  Loader2,
  Lock,
  Zap,
  Check,  FileUp} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function BankingPage() {
  const router = useRouter();
  const { firebaseUser, dbUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  // Notification States
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Reconciliation Simulator States
  const [simStatus, setSimStatus] = useState<"idle" | "matching" | "success">("idle");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  if (loading || orgLoading || !firebaseUser || (firebaseUser && needsOrgSetup)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const handleNotifyMe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubscribed(true);
      toast.success("Spot reserved successfully!");
    }, 1200);
  };

  const startReconciliationSimulation = () => {
    setSimStatus("matching");
    setTimeout(() => {
      setSimStatus("success");
      toast.success("AI auto-matched and reconciled successfully!");
    }, 2000);
  };

  const resetSimulation = () => {
    setSimStatus("idle");
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={<span className="text-sm font-medium">Banking</span>}
          actions={
            <Link href="/batch-import?section=banking&type=Bank Statements&back=/banking">
              <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-8 text-xs border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                <FileUp className="h-3.5 w-3.5" /> Batch Import
              </Button>
            </Link>
          }
        />

        <div className="flex flex-1 flex-col gap-6 p-6 bg-slate-50/50 dark:bg-slate-950/40">
          
          {/* Header Section */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-xl border border-indigo-900/30">
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="absolute left-1/3 bottom-0 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-2xl space-y-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-300 border border-indigo-500/30 animate-pulse">
                  <Sparkles className="h-3 w-3" /> Coming Soon
                </span>
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  Automated Bank Feed & Smart Reconciliation
                </h1>
                <p className="text-slate-300 text-sm md:text-base leading-relaxed">
                  Connect your business accounts directly to HAI Accounting. Fetch real-time feeds, auto-categorize expenses, issue smart virtual cards, and reconcile financial statements in seconds.
                </p>
              </div>

              {/* VIP Beta Access Sign Up */}
              <div className="w-full md:w-auto shrink-0 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 md:max-w-xs">
                {isSubscribed ? (
                  <div className="text-center space-y-2 py-2">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <Check className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-sm">VIP Spot Reserved!</h3>
                    <p className="text-xs text-slate-400">
                      We've queued {email} for early beta access keys.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleNotifyMe} className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm text-slate-100">Join the VIP Beta List</h3>
                      <p className="text-xs text-slate-400">Be first to test real-time banking integrations.</p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="business@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-9 bg-slate-950/60 border-slate-800 text-white text-xs placeholder:text-slate-500 focus-visible:ring-indigo-500"
                        disabled={isSubmitting}
                      />
                      <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white h-9 px-3 shrink-0" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Features Grid and Holographic Virtual Card */}
          <div className="grid gap-6 md:grid-cols-3">
            
            {/* Left side: Premium Virtual Card Visualization */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-gradient-to-b from-slate-900 to-indigo-950 p-6 shadow-md border border-indigo-900/20 md:col-span-1 relative overflow-hidden min-h-[320px] group">
              <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all duration-500" />
              
              {/* Virtual Holographic Card container */}
              <div className="w-full max-w-[280px] aspect-[1.586/1] rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-500 p-5 shadow-2xl flex flex-col justify-between text-white relative overflow-hidden border border-white/20 transform hover:-translate-y-2 hover:rotate-2 hover:shadow-cyan-500/10 transition-all duration-300">
                {/* Holographic light layer overlay */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 pointer-events-none" />
                
                {/* Card Top */}
                <div className="flex justify-between items-start z-10">
                  <div className="space-y-1">
                    <span className="text-[10px] tracking-widest text-indigo-100/80 font-bold uppercase">HAI VIRTUAL</span>
                    <h2 className="text-sm font-black tracking-wider">PLATINUM</h2>
                  </div>
                  <div className="h-7 w-9 bg-yellow-400/80 rounded-md border border-yellow-300/40 relative overflow-hidden shadow-inner flex items-center justify-center">
                    {/* Golden chip lines */}
                    <div className="absolute inset-x-0 top-1/2 h-px bg-yellow-800/40" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-yellow-800/40" />
                  </div>
                </div>

                {/* Card Middle */}
                <div className="z-10 py-1">
                  <span className="text-xs text-indigo-100/70 font-mono">Card Number</span>
                  <div className="text-base font-bold tracking-widest font-mono select-all">••••  ••••  ••••  4290</div>
                </div>

                {/* Card Bottom */}
                <div className="flex justify-between items-end z-10">
                  <div>
                    <span className="text-[9px] text-indigo-100/60 uppercase block">Cardholder</span>
                    <span className="text-xs font-semibold tracking-wide uppercase">{dbUser?.name || "VALUED MEMBER"}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-indigo-100/60 uppercase block">Expires</span>
                    <span className="text-xs font-semibold tracking-wide font-mono">08/30</span>
                  </div>
                </div>
              </div>

              {/* Card Meta Stats below the card */}
              <div className="w-full mt-6 space-y-2 text-center relative z-10">
                <span className="text-xs text-indigo-300/80 font-medium">Virtual Card Issuing & Expense Controls</span>
                <div className="flex justify-center gap-4 text-slate-400 text-xs">
                  <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5 text-indigo-400" /> Instant Lock</span>
                  <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-indigo-400" /> Spend Limits</span>
                </div>
              </div>
            </div>

            {/* Right side: 4 Key Feature Cards Grid */}
            <div className="md:col-span-2 grid gap-4 sm:grid-cols-2">
              
              {/* Feature 1 */}
              <Card className="hover:shadow-md transition-all duration-300 group hover:border-indigo-200">
                <CardHeader className="pb-2">
                  <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-all duration-300">
                    <Building className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">10,000+ Banks Supported</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Direct integration with major private and public sector banks including SBI, ICICI, HDFC, Axis, and global services via highly secure financial APIs.
                  </CardDescription>
                </CardContent>
              </Card>

              {/* Feature 2 */}
              <Card className="hover:shadow-md transition-all duration-300 group hover:border-indigo-200">
                <CardHeader className="pb-2">
                  <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-all duration-300">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">AI Matching Engine</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Our machine learning pipeline scans incoming transaction descriptions, matching them automatically with outstanding customer invoices or recurring vendor bills.
                  </CardDescription>
                </CardContent>
              </Card>

              {/* Feature 3 */}
              <Card className="hover:shadow-md transition-all duration-300 group hover:border-indigo-200">
                <CardHeader className="pb-2">
                  <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-all duration-300">
                    <Shield className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">Bank-Grade Security</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Read-only data connections encrypted with TLS 1.3, multi-factor authentication, and SOC2-compliant hosting environments to guarantee account privacy.
                  </CardDescription>
                </CardContent>
              </Card>

              {/* Feature 4 */}
              <Card className="hover:shadow-md transition-all duration-300 group hover:border-indigo-200">
                <CardHeader className="pb-2">
                  <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-all duration-300">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">Real-time Cash Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Interactive dashboards automatically adjust cash flow forecasts, runway counts, and liquid asset charts as soon as a transaction clears.
                  </CardDescription>
                </CardContent>
              </Card>

            </div>
          </div>

          {/* Interactive AI Reconciliation Simulator Panel */}
          <Card className="border border-indigo-100 dark:border-indigo-950/60 overflow-hidden shadow-sm">
            <CardHeader className="bg-slate-100/50 dark:bg-slate-900/30 border-b pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-indigo-600 dark:text-indigo-400" /> Interactive AI Reconciliation Simulator
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Experience firsthand how HAI will automate matching bank receipts with outstanding documents.
                  </CardDescription>
                </div>
                {simStatus === "success" && (
                  <Button variant="outline" size="sm" onClick={resetSimulation} className="text-xs gap-1.5 h-8">
                    <RefreshCw className="h-3 w-3" /> Reset Simulator
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              
              {/* Simulator Grid */}
              <div className="grid gap-6 md:grid-cols-2.5 items-stretch">
                
                {/* Left Side: Simulation flow container */}
                <div className="space-y-4 flex-1">
                  <div className="grid gap-4 sm:grid-cols-2">
                    
                    {/* Bank Feed Card */}
                    <div className="rounded-xl border p-4 bg-white dark:bg-slate-950 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">BANK STATEMENT RECEIPT</span>
                        <Building className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-xs text-slate-500">Incoming Feed</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">ACME CORP IND PVT LTD</div>
                        <div className="text-lg font-black text-slate-950 dark:text-white">₹1,42,500.00</div>
                        <div className="text-[10px] text-slate-400 font-mono">REF: TXN-94827104B-AXIS</div>
                      </div>
                    </div>

                    {/* Invoice Card */}
                    <div className="rounded-xl border p-4 bg-white dark:bg-slate-950 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500" />
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide">UNPAID SALES INVOICE</span>
                        <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-xs text-slate-500">Invoice Ref</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">Acme Corp (#INV-2026-0084)</div>
                        <div className="text-lg font-black text-slate-950 dark:text-white">₹1,42,500.00</div>
                        <div className="text-[10px] text-slate-400 font-mono">DUE DATE: 15-JUN-2026</div>
                      </div>
                    </div>

                  </div>

                  {/* Connect and run matching actions */}
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 p-4 border border-dashed flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                      {simStatus === "idle" && "Click below to execute our intelligent invoice-to-bank-feed matching algorithm."}
                      {simStatus === "matching" && "Scanning transactions. Matching date ranges, amounts, names, and reference codes..."}
                      {simStatus === "success" && "Verification complete! Ledgers balanced. The invoice status has been updated to Paid."}
                    </div>

                    {simStatus === "idle" && (
                      <Button onClick={startReconciliationSimulation} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5 shrink-0 h-9">
                        <Cpu className="h-3.5 w-3.5" /> Reconcile Match <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {simStatus === "matching" && (
                      <Button disabled className="bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-xs gap-1.5 shrink-0 h-9">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Analyzing feeds...
                      </Button>
                    )}

                    {simStatus === "success" && (
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Fully Reconciled
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </CardContent>
          </Card>

        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
