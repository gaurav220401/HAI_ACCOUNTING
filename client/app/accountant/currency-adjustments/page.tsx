"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Plus,
  ChevronDown,
  FileText,
  SlidersHorizontal,
  Loader2,
  X,
  UserSearch,
  ChevronLeft,
  RefreshCw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listCurrencyAdjustments,
  createCurrencyAdjustment,
  type CurrencyAdjustment,
} from "@/lib/api/currency-adjustments";

// ─── Currency options ─────────────────────────────────────────────────────────

const CURRENCY_OPTIONS = [
  { code: "AED", label: "UAE Dirham" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "CNY", label: "Chinese Yuan" },
];

type StatusFilter = "All" | "Open" | "Reconciled";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// ─── Notes Popover ────────────────────────────────────────────────────────────

function NotesCell({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center justify-center">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={cn(
          "rounded p-1 transition-colors",
          notes
            ? "text-primary hover:bg-primary/10"
            : "text-muted-foreground/40 hover:bg-muted/40 hover:text-muted-foreground"
        )}
      >
        <FileText className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-56 rounded-lg border bg-popover p-3 shadow-lg">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {notes || <span className="text-muted-foreground italic">No notes added.</span>}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Make Adjustment Modal ────────────────────────────────────────────────────

function MakeAdjustmentDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (adj: CurrencyAdjustment) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [currency, setCurrency] = useState("AED");
  const [exchangeRate, setExchangeRate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setDate(today); setCurrency("AED"); setExchangeRate(""); setNotes(""); };

  const formattedDate = date
    ? new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  const handleContinue = async () => {
    if (!notes.trim()) { toast.error("Notes are required"); return; }
    if (!exchangeRate || isNaN(Number(exchangeRate)) || Number(exchangeRate) <= 0) {
      toast.error("Please enter a valid exchange rate"); return;
    }
    setSaving(true);
    try {
      const res = await createCurrencyAdjustment({
        date,
        currency,
        exchangeRate: Number(exchangeRate),
        notes,
        lines: [],
      });
      onSaved(res.data);
      toast.success("Currency adjustment saved!");
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save adjustment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-[440px] p-0 gap-0 overflow-hidden border shadow-lg [&>button]:hidden">

        {/* Title bar */}
        <div className="flex items-center justify-between border-b px-5 py-3.5 bg-background">
          <DialogTitle className="text-[15px] font-semibold text-foreground">
            Base Currency Adjustment
          </DialogTitle>
          <button onClick={() => { reset(); onClose(); }} className="text-destructive hover:text-red-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="bg-background px-5 pt-5 pb-4 space-y-4">

          {/* Currency */}
          <div className="space-y-1">
            <Label className="text-sm font-medium text-red-500">Currency*</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date of Adjustment */}
          <div className="space-y-1">
            <Label htmlFor="adj-date" className="text-sm font-medium text-red-500">Date of Adjustment*</Label>
            <div className="relative h-9">
              <input
                id="adj-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex items-center h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground select-none pointer-events-none">
                {formattedDate}
              </div>
            </div>
          </div>

          {/* Exchange Rate */}
          <div className="space-y-1">
            <Label className="text-sm font-medium text-red-500">Exchange Rate*</Label>
            <div className="flex items-stretch h-9 rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 bg-background">
              <span className="flex items-center px-3 text-sm text-muted-foreground bg-muted/40 border-r whitespace-nowrap select-none">
                1&nbsp;{currency}&nbsp;=
              </span>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="flex-1 min-w-0 px-3 text-sm bg-background outline-none tabular-nums"
              />
              <span className="flex items-center px-3 text-sm text-muted-foreground bg-muted/40 border-l whitespace-nowrap select-none font-medium">
                INR
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-sm font-medium text-red-500">Notes*</Label>
            <div className="relative">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Max. 500 characters"
                maxLength={500}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              />
              <span className="absolute bottom-2 right-2.5 text-muted-foreground/40 text-xs pointer-events-none select-none">✎</span>
            </div>
          </div>
        </div>

        <div className="border-t" />

        {/* Footer */}
        <div className="flex items-center gap-2.5 bg-background px-5 py-3.5">
          <Button onClick={handleContinue} disabled={saving} size="sm"
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-none">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </Button>
          <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }} disabled={saving}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function AdjustmentDetailPanel({
  adj,
  onClose,
}: {
  adj: CurrencyAdjustment;
  onClose: () => void;
}) {
  const totalGainLoss = adj.lines.reduce((s, l) => s + l.gainOrLoss, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b shrink-0 bg-background">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-primary hover:text-primary/80 text-sm font-medium transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {adj.currency} – Currency Adjustment
          </button>
        </div>
        <button className="flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Reevaluate
          <Info className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {/* ── Meta info ── */}
      <div className="px-6 py-4 border-b shrink-0 bg-background">
        <div className="flex items-start gap-16">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Date of Adjustment</p>
            <p className="text-sm font-semibold">{fmtDate(adj.date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Exchange Rate</p>
            <p className="text-sm font-semibold">{fmtNumber(adj.exchangeRate)}</p>
          </div>
        </div>
        {adj.notes && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground">{adj.notes}</p>
          </div>
        )}
      </div>

      {/* ── Lines table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="border-b bg-muted/20">
              <th className="text-left px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Account
              </th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                Balance ({adj.currency})
              </th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                Balance (INR)
              </th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                Revalued Balance (INR)
              </th>
              <th className="text-right px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                Gain or Loss (INR)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {adj.lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-16 text-muted-foreground text-sm">
                  <div className="flex flex-col items-center gap-2">
                    <SlidersHorizontal className="h-7 w-7 text-muted-foreground/30" />
                    <p>No account lines yet.</p>
                  </div>
                </td>
              </tr>
            ) : (
              adj.lines.map((line, i) => (
                <tr key={i} className="hover:bg-muted/20 group">
                  <td className="px-6 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {/* Blue dot like the image */}
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-primary font-medium text-sm">{line.account}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm">
                    {fmtNumber(line.balanceForeign)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm">
                    {fmtNumber(line.balanceBase)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm">
                    {fmtNumber(line.revaluedBalance)}
                  </td>
                  <td className="px-6 py-2.5 text-right tabular-nums text-sm">
                    <span className={cn("font-medium", line.gainOrLoss < 0 ? "text-destructive" : "text-emerald-600")}>
                      {fmtNumber(line.gainOrLoss)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {/* Totals footer when there are lines */}
          {adj.lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/10">
                <td colSpan={4} className="px-6 py-2.5 text-sm font-semibold text-right text-muted-foreground">
                  Total Gain / Loss
                </td>
                <td className="px-6 py-2.5 text-right tabular-nums font-bold text-sm">
                  <span className={cn(totalGainLoss < 0 ? "text-destructive" : "text-emerald-600")}>
                    {fmtNumber(totalGainLoss)}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Status badge footer ── */}
      <div className="px-6 py-3 border-t bg-background shrink-0 flex items-center justify-between">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded",
            adj.status === "Open"
              ? "text-blue-600 bg-blue-50 border border-blue-200"
              : "text-emerald-600 bg-emerald-50 border border-emerald-200"
          )}
        >
          {adj.status}
        </span>
        <p className="text-xs text-muted-foreground">#{adj.adjustmentNumber}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CurrencyAdjustmentsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [adjustments, setAdjustments] = useState<CurrencyAdjustment[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedAdj, setSelectedAdj] = useState<CurrencyAdjustment | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => { if (!loading && !firebaseUser) router.push("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const loadData = useCallback(async () => {
    setFetching(true);
    try {
      const res = await listCurrencyAdjustments();
      setAdjustments(res.data);
    } catch {
      // silently fail on first load (user may not be authenticated yet)
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading) loadData();
  }, [firebaseUser, loading, loadData]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ── Filter / select ──────────────────────────────────────────────────────────
  const filtered = adjustments.filter((a) =>
    statusFilter === "All" ? true : a.status === statusFilter
  );
  const allChecked = filtered.length > 0 && filtered.every((a) => selected.has(a._id));
  const someChecked = filtered.some((a) => selected.has(a._id));

  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(filtered.map((a) => a._id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const panelOpen = !!selectedAdj;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh">

        {/* ── Header ── */}
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Accountant <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Base Currency Adjustments</span>
            </span>
          }
          actions={
            !panelOpen ? (
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2">
                  <UserSearch className="h-3.5 w-3.5" />
                  Find Accountants
                </button>
                <Button size="sm" className="gap-1.5" onClick={() => setModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Make an Adjustment
                </Button>
              </div>
            ) : null
          }
        />

        {/* ── Body — split layout ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT: list */}
          <div className={cn(
            "flex flex-col border-r transition-all duration-200 overflow-hidden",
            panelOpen ? "w-[340px] shrink-0" : "flex-1"
          )}>

            {/* Filter bar / compact header */}
            <div className={cn(
              "flex items-center gap-2 border-b shrink-0 bg-background",
              panelOpen ? "px-3 py-2 justify-between" : "px-5 py-3"
            )}>
              {panelOpen ? (
                <>
                  <span className="text-sm font-semibold">Adjustments</span>
                  <Button size="icon" className="h-6 w-6" onClick={() => setModalOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground font-medium">Filter By :</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 px-2.5">
                        {statusFilter}<ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-36">
                      {(["All", "Open", "Reconciled"] as StatusFilter[]).map((f) => (
                        <DropdownMenuItem key={f} onClick={() => setStatusFilter(f)}
                          className={cn("text-sm", statusFilter === f && "font-medium text-primary bg-primary/5")}>
                          {f}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {fetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
                  {selected.size > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">{selected.size} selected</span>
                  )}
                </>
              )}
            </div>

            {/* Table / Narrow list */}
            <div className="flex-1 overflow-auto">
              {panelOpen ? (
                /* Narrow list when panel is open */
                <div className="divide-y">
                  {filtered.map((adj) => {
                    const isSel = selectedAdj?._id === adj._id;
                    return (
                      <div key={adj._id} onClick={() => setSelectedAdj(adj)}
                        className={cn(
                          "flex items-start gap-2 px-3 py-3 cursor-pointer hover:bg-muted/20 transition-colors",
                          isSel && "bg-blue-50 border-l-2 border-l-primary"
                        )}>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <p className={cn("text-xs font-medium truncate", isSel && "text-primary")}>
                              {fmtDate(adj.date)}
                            </p>
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 shrink-0">
                              {adj.currency}
                            </span>
                          </div>
                          <div className="flex gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                            <span className="text-primary font-medium">{adj.adjustmentNumber}</span>
                            <span>·</span>
                            <span className={adj.status === "Open" ? "text-blue-600 font-semibold" : "text-emerald-600 font-semibold"}>
                              {adj.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Full table */
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b">
                      <th className="w-10 px-4 py-3">
                        <input type="checkbox" className="accent-primary" checked={allChecked}
                          ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                          onChange={toggleAll} />
                      </th>
                      {[
                        { label: "Date", cls: "text-left" },
                        { label: "Currency", cls: "text-left" },
                        { label: "Exchange Rate", cls: "text-right" },
                        { label: "Gain or Loss", cls: "text-right" },
                        { label: "Notes", cls: "text-center" },
                      ].map(({ label, cls }) => (
                        <th key={label} className={cn(
                          "px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap",
                          cls
                        )}>{label}</th>
                      ))}
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fetching && filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-20">
                          <div className="flex justify-center">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          </div>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-20 text-muted-foreground text-sm">
                          <div className="flex flex-col items-center gap-2">
                            <SlidersHorizontal className="h-8 w-8 text-muted-foreground/30" />
                            <p>No currency adjustments found.</p>
                            <Button variant="outline" size="sm" className="mt-1 gap-1.5"
                              onClick={() => setModalOpen(true)}>
                              <Plus className="h-4 w-4" />Make an Adjustment
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((adj) => {
                        const totalGL = adj.lines.reduce((s, l) => s + l.gainOrLoss, 0);
                        return (
                          <tr key={adj._id}
                            onClick={() => setSelectedAdj(adj)}
                            className="hover:bg-muted/20 cursor-pointer group">
                            <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" className="accent-primary"
                                checked={selected.has(adj._id)} onChange={() => toggleOne(adj._id)} />
                            </td>
                            <td className="px-3 py-2.5 font-medium whitespace-nowrap">{fmtDate(adj.date)}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 tracking-wide">
                                {adj.currency}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                              {fmtNumber(adj.exchangeRate)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {adj.lines.length > 0 ? (
                                <span className={cn("font-semibold", totalGL < 0 ? "text-destructive" : "text-emerald-600")}>
                                  {fmtNumber(totalGL)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5"><NotesCell notes={adj.notes} /></td>
                            <td className="px-3 py-2.5">
                              <span className={cn(
                                "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                                adj.status === "Open"
                                  ? "text-blue-600 bg-blue-50 border border-blue-200"
                                  : "text-emerald-600 bg-emerald-50 border border-emerald-200"
                              )}>{adj.status}</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT: detail panel */}
          {panelOpen && selectedAdj && (
            <div className="flex-1 overflow-hidden">
              <AdjustmentDetailPanel
                adj={selectedAdj}
                onClose={() => setSelectedAdj(null)}
              />
            </div>
          )}
        </div>

        {/* ── Modal ── */}
        <MakeAdjustmentDialog
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={(adj) => {
            setAdjustments((prev) => [adj, ...prev]);
            setSelectedAdj(adj);
          }}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
