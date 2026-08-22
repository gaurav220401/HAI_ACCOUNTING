"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Lock, LockOpen, UserSearch, Info, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { transactionLockApi } from "@/lib/api/transaction-locks";

// ─── Types ───────────────────────────────────────────────────────────────────

type Module = "Sales" | "Purchases" | "Banking" | "Accountant";

interface ModuleLock {
  module: Module;
  locked: boolean;
  lockedDate: string | null; // ISO date string
}

type LockMode = "individual" | "global";

const MODULE_DESCRIPTIONS: Record<Module, string> = {
  Sales: "Locks sales transactions including invoices, credit notes, and payments received.",
  Purchases: "Locks purchase transactions including bills, vendor credits, and payments made.",
  Banking: "Locks banking transactions including bank feeds and reconciled entries.",
  Accountant: "Locks accountant transactions including manual journals and currency adjustments.",
};

const MODULES: Module[] = ["Sales", "Purchases", "Banking", "Accountant"];

const INITIAL_LOCKS: ModuleLock[] = [
  { module: "Sales", locked: false, lockedDate: null },
  { module: "Purchases", locked: false, lockedDate: null },
  { module: "Banking", locked: false, lockedDate: null },
  { module: "Accountant", locked: false, lockedDate: null },
];

/**
 * The backend has no separate "global lock" record — it's derived here from
 * the 4 module rows. All 4 count as globally locked only when every module
 * is locked to the exact same date.
 */
function deriveGlobalLock(locks: ModuleLock[]): { locked: boolean; date: string | null } {
  if (locks.length !== 4 || !locks.every((l) => l.locked && l.lockedDate)) {
    return { locked: false, date: null };
  }
  const first = locks[0].lockedDate;
  return locks.every((l) => l.lockedDate === first)
    ? { locked: true, date: first }
    : { locked: false, date: null };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Lock Dialog ─────────────────────────────────────────────────────────────

function LockDialog({
  open,
  module,
  isLocked,
  currentDate,
  onClose,
  onConfirm,
}: {
  open: boolean;
  module: Module | "All";
  isLocked: boolean;
  currentDate: string | null;
  onClose: () => void;
  onConfirm: (date: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(currentDate?.split("T")[0] ?? today);

  useEffect(() => {
    if (open) setDate(currentDate?.split("T")[0] ?? today);
  }, [open, currentDate, today]);

  const formattedDate = date
    ? new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const action = isLocked ? "Update Lock" : "Lock";
  const title =
    module === "All"
      ? isLocked
        ? "Update Global Lock"
        : "Lock All Transactions"
      : isLocked
      ? `Update ${module} Lock`
      : `Lock ${module} Transactions`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[420px] p-0 gap-0 overflow-hidden border shadow-lg [&>button]:hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b px-5 py-3.5 bg-background">
          <DialogTitle className="text-[15px] font-semibold text-foreground flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            {title}
          </DialogTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 bg-background">
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            {module === "All"
              ? "All transactions recorded before the selected date will be locked across all modules."
              : MODULE_DESCRIPTIONS[module as Module]}
          </DialogDescription>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Lock transactions before <span className="text-destructive">*</span>
            </label>
            <div className="relative h-9">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex items-center h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground select-none pointer-events-none">
                {formattedDate || <span className="text-muted-foreground">Select a date</span>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Transactions on or before this date will be locked and cannot be modified.
            </p>
          </div>

          {isLocked && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 leading-relaxed">
                This will update the existing lock date. Any transactions previously locked may be affected.
              </p>
            </div>
          )}
        </div>

        <div className="border-t" />

        {/* Footer */}
        <div className="flex items-center gap-2.5 bg-background px-5 py-3.5">
          <Button
            size="sm"
            className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
            onClick={() => onConfirm(date)}
            disabled={!date}
          >
            <Lock className="h-3.5 w-3.5" />
            {action}
          </Button>
          <Button variant="outline" size="sm" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unlock Confirm Dialog ────────────────────────────────────────────────────

function UnlockDialog({
  open,
  module,
  onClose,
  onConfirm,
}: {
  open: boolean;
  module: Module | "All";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[400px] p-0 gap-0 overflow-hidden border shadow-lg [&>button]:hidden">
        <div className="flex items-center justify-between border-b px-5 py-3.5 bg-background">
          <DialogTitle className="text-[15px] font-semibold text-foreground flex items-center gap-2">
            <LockOpen className="h-4 w-4 text-muted-foreground" />
            Unlock {module === "All" ? "All Transactions" : `${module} Transactions`}
          </DialogTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 bg-background">
          <DialogDescription className="text-sm text-muted-foreground">
            Are you sure you want to unlock{" "}
            {module === "All" ? "all transactions" : `${module} transactions`}? Users will be
            able to edit, modify, or delete previously locked transactions.
          </DialogDescription>
          <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive leading-relaxed">
              This action will remove the transaction lock for this module.
            </p>
          </div>
        </div>
        <div className="border-t" />
        <div className="flex items-center gap-2.5 bg-background px-5 py-3.5">
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={onConfirm}
          >
            <LockOpen className="h-3.5 w-3.5" />
            Unlock
          </Button>
          <Button variant="outline" size="sm" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Module Row ───────────────────────────────────────────────────────────────

function ModuleRow({
  lock,
  onLockClick,
  onUnlockClick,
}: {
  lock: ModuleLock;
  onLockClick: () => void;
  onUnlockClick: () => void;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border border-slate-200 rounded-lg bg-white hover:bg-teal-50/20 transition-colors group">
      {/* Lock icon */}
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          lock.locked
            ? "bg-teal-50 text-teal-700"
            : "bg-slate-100 text-slate-400"
        )}
      >
        {lock.locked ? (
          <Lock className="h-4 w-4" />
        ) : (
          <LockOpen className="h-4 w-4" />
        )}
      </div>

      {/* Module name and status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            {lock.module}
          </span>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={MODULE_DESCRIPTIONS[lock.module]}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {lock.locked && lock.lockedDate ? (
          <>
            Transactions locked before{" "}
            <span className="font-semibold text-teal-700">
              {formatDate(lock.lockedDate)}
            </span>
          </>
        ) : (
          <span className="text-teal-600 font-medium">
            You have not locked the transactions in this module.
          </span>
        )}
        </p>
      </div>

      {/* Action button */}
      <div className="flex items-center gap-2 shrink-0">
        {lock.locked && (
          <button
            onClick={onUnlockClick}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100"
          >
            <LockOpen className="h-3 w-3" />
            Unlock
          </button>
        )}
        <button
          onClick={onLockClick}
          className={cn(
            "flex items-center gap-1 text-xs font-semibold hover:text-teal-800 transition-colors text-teal-700"
          )}
        >
          <Lock className="h-3 w-3" />
          {lock.locked ? "Update" : "Lock"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionLockingPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [locks, setLocks] = useState<ModuleLock[]>(INITIAL_LOCKS);
  const [globalLock, setGlobalLock] = useState<{ locked: boolean; date: string | null }>({
    locked: false,
    date: null,
  });
  const [locksLoading, setLocksLoading] = useState(true);
  const [lockMode, setLockMode] = useState<LockMode>("individual");

  // Lock dialog state
  const [lockDialog, setLockDialog] = useState<{
    open: boolean;
    module: Module | "All";
    isLocked: boolean;
    currentDate: string | null;
  }>({ open: false, module: "Sales", isLocked: false, currentDate: null });

  // Unlock dialog state
  const [unlockDialog, setUnlockDialog] = useState<{
    open: false | { module: Module | "All" };
  }>({ open: false });

  // Auth guards
  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Load current lock state from the backend
  useEffect(() => {
    let cancelled = false;
    async function fetchLocks() {
      try {
        const res = await transactionLockApi.list();
        if (cancelled) return;
        const data = res.data?.length === 4 ? res.data : INITIAL_LOCKS;
        setLocks(data);
        setGlobalLock(deriveGlobalLock(data));
      } catch (error) {
        if (cancelled) return;
        toast.error(
          error instanceof Error ? error.message : "Failed to load transaction locks",
        );
      } finally {
        if (!cancelled) setLocksLoading(false);
      }
    }
    fetchLocks();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || orgLoading || !firebaseUser || locksLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openLockDialog(module: Module | "All") {
    if (module === "All") {
      setLockDialog({
        open: true,
        module: "All",
        isLocked: globalLock.locked,
        currentDate: globalLock.date,
      });
    } else {
      const current = locks.find((l) => l.module === module)!;
      setLockDialog({
        open: true,
        module,
        isLocked: current.locked,
        currentDate: current.lockedDate,
      });
    }
  }

  async function handleLockConfirm(date: string) {
    const isoDate = new Date(date + "T00:00:00").toISOString();
    const targetModule = lockDialog.module;
    setLockDialog((prev) => ({ ...prev, open: false }));

    try {
      if (targetModule === "All") {
        // Lock all 4 modules to the same date.
        const results = await Promise.all(
          MODULES.map((module) => transactionLockApi.lock(module, isoDate)),
        );
        const updatedLocks = results.map((r) => r.data);
        setLocks(updatedLocks);
        setGlobalLock(deriveGlobalLock(updatedLocks));
        toast.success("All transactions locked successfully.");
      } else {
        const res = await transactionLockApi.lock(targetModule, isoDate);
        const updatedLocks = locks.map((l) =>
          l.module === targetModule ? res.data : l,
        );
        setLocks(updatedLocks);
        setGlobalLock(deriveGlobalLock(updatedLocks));
        toast.success(`${targetModule} transactions locked.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update lock");
    }
  }

  function openUnlockDialog(module: Module | "All") {
    setUnlockDialog({ open: { module } });
  }

  async function handleUnlockConfirm() {
    if (!unlockDialog.open) return;
    const { module } = unlockDialog.open;
    setUnlockDialog({ open: false });

    try {
      if (module === "All") {
        const results = await Promise.all(
          MODULES.map((m) => transactionLockApi.unlock(m)),
        );
        const updatedLocks = results.map((r) => r.data);
        setLocks(updatedLocks);
        setGlobalLock({ locked: false, date: null });
        toast.success("All transactions unlocked.");
      } else {
        const res = await transactionLockApi.unlock(module);
        const updatedLocks = locks.map((l) => (l.module === module ? res.data : l));
        setLocks(updatedLocks);
        setGlobalLock(deriveGlobalLock(updatedLocks));
        toast.success(`${module} transactions unlocked.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unlock");
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh bg-white">
        {/* ── Header ── */}
        <PageHeader
          breadcrumb={
            <span className="flex flex-col text-left">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Accountant</span>
              <span className="text-sm font-semibold text-slate-700 mt-0.5">Transaction Locking</span>
            </span>
          }
          actions={
            <button className="flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-800 hover:underline underline-offset-2 font-semibold">
              <UserSearch className="h-3.5 w-3.5" />
              Find Accountants
            </button>
          }
        />

        {/* ── Body ── */}
        <div className="flex flex-col flex-1 overflow-auto">
          <div className="flex flex-col flex-1 px-6 py-6 max-w-3xl w-full">
            {/* Info banner */}
            <div className="mb-6 text-sm text-slate-500 leading-relaxed">
              <span className="text-teal-700 font-semibold">
                Transaction locking
              </span>{" "}
              prevents you and your users from making any changes to
              transactions that might affect your accounts. Once transactions
              are locked, users cannot edit, modify, or delete any transactions
              that were recorded before the specified date in this module.
            </div>

            {/* Individual module locks */}
            {lockMode === "individual" && (
              <div className="space-y-3">
                {locks.map((lock) => (
                  <ModuleRow
                    key={lock.module}
                    lock={lock}
                    onLockClick={() => openLockDialog(lock.module)}
                    onUnlockClick={() => openUnlockDialog(lock.module)}
                  />
                ))}
              </div>
            )}

            {/* Global lock (switch to lock all mode) */}
            {lockMode === "global" && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 px-5 py-5 border border-slate-200 rounded-lg bg-white">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      globalLock.locked
                        ? "bg-teal-50 text-teal-700"
                        : "bg-slate-100 text-slate-400"
                    )}
                  >
                    {globalLock.locked ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <LockOpen className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">
                      All Transactions
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {globalLock.locked && globalLock.date ? (
                        <>
                          All transactions locked before{" "}
                          <span className="font-semibold text-teal-700">
                            {formatDate(globalLock.date)}
                          </span>
                        </>
                      ) : (
                        <span className="text-teal-600 font-medium">
                          You have not locked all transactions globally.
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {globalLock.locked && (
                      <button
                        onClick={() => openUnlockDialog("All")}
                        className="text-xs text-slate-500 hover:text-rose-600 transition-colors flex items-center gap-1 font-semibold"
                      >
                        <LockOpen className="h-3 w-3" />
                        Unlock All
                      </button>
                    )}
                    <button
                      onClick={() => openLockDialog("All")}
                      className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors"
                    >
                      <Lock className="h-3 w-3" />
                      {globalLock.locked ? "Update" : "Lock All"}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground px-1">
                  This will lock Sales, Purchases, Banking, and Accountant
                  transactions at the same date.
                </p>
              </div>
            )}
          </div>

          {/* ── Bottom bar — Lock All at Once / Switch back ── */}
          <div className="border-t bg-muted/30 px-6 py-4 shrink-0 flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {lockMode === "individual"
                  ? "Lock All Transactions At Once"
                  : "Lock Transactions Individually"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
                {lockMode === "individual"
                  ? "You can freeze all transactions at once instead of locking the Sales, Purchases, Banking and Account transactions individually."
                  : "You can lock each module separately to have fine-grained control over which transactions are locked."}
              </p>
            </div>
            <button
              onClick={() =>
                setLockMode((prev) =>
                  prev === "individual" ? "global" : "individual"
                )
              }
              className="text-xs text-teal-700 hover:text-teal-800 hover:underline underline-offset-2 whitespace-nowrap ml-6 shrink-0 font-semibold"
            >
              {lockMode === "individual"
                ? "Switch to Lock All Transactions"
                : "Switch to Individual Locking"}
            </button>
          </div>
        </div>

        {/* ── Dialogs ── */}
        <LockDialog
          open={lockDialog.open}
          module={lockDialog.module}
          isLocked={lockDialog.isLocked}
          currentDate={lockDialog.currentDate}
          onClose={() => setLockDialog((prev) => ({ ...prev, open: false }))}
          onConfirm={handleLockConfirm}
        />

        <UnlockDialog
          open={!!unlockDialog.open}
          module={
            unlockDialog.open ? unlockDialog.open.module : "Sales"
          }
          onClose={() => setUnlockDialog({ open: false })}
          onConfirm={handleUnlockConfirm}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
