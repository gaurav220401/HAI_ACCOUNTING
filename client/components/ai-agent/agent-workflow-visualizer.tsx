"use client";

import { useEffect, useState } from "react";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import { salesToPaymentWorkflow, type AgentPhase } from "@/lib/api/ai-agent";
import { cn } from "@/lib/utils";
import { Check, X, Loader2, Play, AlertCircle } from "lucide-react";

interface ActivityLog {
  timestamp: string;
  type: "info" | "success" | "error" | "warning";
  text: string;
}

export function AgentWorkflowVisualizer() {
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingMetadata, setLoadingMetadata] = useState(true);

  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState(0);

  // Workflow running states
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [visualPhases, setVisualPhases] = useState<AgentPhase[]>([
    { phaseIndex: 1, name: "Create Sales Order", description: "Creates a sales order document", status: "pending" },
    { phaseIndex: 2, name: "Convert to Invoice", description: "Converts sales order items to a customer invoice", status: "pending" },
    { phaseIndex: 3, name: "Record Payment", description: "Records cash/bank payment settlement", status: "pending" },
  ]);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [manualSteps, setManualSteps] = useState<string[]>([]);
  const [workflowOutput, setWorkflowOutput] = useState<any>(null);

  // Load dropdown lists
  useEffect(() => {
    async function loadData() {
      try {
        const [custRes, itemsRes] = await Promise.all([
          contactApi.list({ type: "Customer", limit: 100 }),
          itemApi.list({ limit: 100 }),
        ]);
        if (custRes.data) setCustomers(custRes.data);
        if (itemsRes.data) {
          setItems(itemsRes.data);
          if (itemsRes.data.length > 0) {
            setSelectedItemId(itemsRes.data[0]._id);
            setRate(itemsRes.data[0].sellingPrice || 0);
          }
        }
      } catch (err) {
        console.error("Failed to load customer/item lists:", err);
      } finally {
        setLoadingMetadata(false);
      }
    }
    loadData();
  }, []);

  // Update price when selected item changes
  const handleItemChange = (itemId: string) => {
    setSelectedItemId(itemId);
    const found = items.find((i) => i._id === itemId);
    if (found) {
      setRate(found.sellingPrice || 0);
    }
  };

  const addLog = (text: string, type: ActivityLog["type"] = "info") => {
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { timestamp: timeStr, text, type }]);
  };

  const handleStartWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !selectedItemId) return;

    setIsExecuting(true);
    setWorkflowError(null);
    setManualSteps([]);
    setWorkflowOutput(null);
    setLogs([]);
    
    // Reset phases to pending/in_progress
    setVisualPhases([
      { phaseIndex: 1, name: "Create Sales Order", description: "Creates a sales order document", status: "in_progress", startedAt: new Date().toISOString() },
      { phaseIndex: 2, name: "Convert to Invoice", description: "Converts sales order items to a customer invoice", status: "pending" },
      { phaseIndex: 3, name: "Record Payment", description: "Records cash/bank payment settlement", status: "pending" },
    ]);

    addLog("🔵 Starting sales document automation workflow...", "info");
    addLog(`⚡ Initiating Phase 1: Preparing Sales Order for customer ID: ${selectedCustomerId}`, "info");

    try {
      const selectedItem = items.find((i) => i._id === selectedItemId);
      const res = await salesToPaymentWorkflow({
        input: {
          customerId: selectedCustomerId,
          items: [
            {
              itemId: selectedItemId,
              name: selectedItem?.name || "Item",
              quantity,
              rate,
            },
          ],
        },
      });

      const { status, phases, output, errorMessage: apiError } = res.data;

      // Staggered presentation transition logic
      // Phase 1 updates
      const p1 = phases.find((p) => p.phaseIndex === 1);
      if (p1 && p1.status === "completed") {
        setVisualPhases((prev) => [
          { ...prev[0], status: "completed", completedAt: p1.completedAt, result: p1.result },
          { ...prev[1], status: "in_progress", startedAt: new Date().toISOString() },
          prev[2],
        ]);
        addLog(`✅ Sales Order created: ${p1.result?.salesOrderNumber || "SO-XXXX"}`, "success");
        addLog(`⚡ Initiating Phase 2: Converting Sales Order to Customer Invoice...`, "info");
      } else {
        failWorkflow(1, p1?.errorMessage || "Failed to create Sales Order", p1?.manualSteps);
        return;
      }

      // Small delay to make visual gear spin premium
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Phase 2 updates
      const p2 = phases.find((p) => p.phaseIndex === 2);
      if (p2 && p2.status === "completed") {
        setVisualPhases((prev) => [
          prev[0],
          { ...prev[1], status: "completed", completedAt: p2.completedAt, result: p2.result },
          { ...prev[2], status: "in_progress", startedAt: new Date().toISOString() },
        ]);
        addLog(`✅ Invoice generated: ${p2.result?.invoiceNumber || "INV-XXXX"}`, "success");
        addLog(`⚡ Initiating Phase 3: Recording Payment settlement entries...`, "info");
      } else {
        failWorkflow(2, p2?.errorMessage || "Failed to convert Invoice", p2?.manualSteps);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Phase 3 updates
      const p3 = phases.find((p) => p.phaseIndex === 3);
      if (p3 && p3.status === "completed") {
        setVisualPhases((prev) => [
          prev[0],
          prev[1],
          { ...prev[2], status: "completed", completedAt: p3.completedAt, result: p3.result },
        ]);
        addLog(`✅ Payment recorded: ${p3.result?.paymentNumber || "PAY-XXXX"}`, "success");
        addLog(`🎉 Document workflow completed successfully!`, "success");
        setWorkflowOutput(output);
      } else {
        failWorkflow(3, p3?.errorMessage || "Failed to record Payment", p3?.manualSteps);
        return;
      }
    } catch (err: any) {
      addLog(`❌ Fatal: ${err.message || "Network request failed"}`, "error");
      setWorkflowError(err.message || "An unexpected error occurred during execution.");
      setVisualPhases((prev) => prev.map((p) => (p.status === "in_progress" ? { ...p, status: "failed" } : p)));
    } finally {
      setIsExecuting(false);
    }
  };

  const failWorkflow = (phaseIdx: number, errText: string, steps?: string[]) => {
    setVisualPhases((prev) => {
      const copy = [...prev];
      copy[phaseIdx - 1] = { ...copy[phaseIdx - 1], status: "failed", errorMessage: errText, manualSteps: steps || [] };
      for (let i = phaseIdx; i < copy.length; i++) {
        copy[i] = { ...copy[i], status: "skipped" };
      }
      return copy;
    });
    addLog(`❌ Step ${phaseIdx} Failed: ${errText}`, "error");
    setWorkflowError(errText);
    if (steps) setManualSteps(steps);
    setIsExecuting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-800">Document Workflow Automation</h3>
        <p className="text-xs text-slate-500 mt-0.5">Chain Sales Order creation, Invoice conversion, and Cash payment settlement automatically.</p>
      </div>

      {loadingMetadata ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
          Loading organization customers and item catalogues...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form settings */}
          <div className="lg:col-span-1 border border-slate-200 rounded-2xl bg-white p-5 space-y-4 shadow-2xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Workflow Parameters</h4>
            
            <form onSubmit={handleStartWorkflow} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-650">Select Customer</label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  disabled={isExecuting}
                  className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:border-teal-500 focus:outline-none bg-white text-slate-700 disabled:opacity-50"
                >
                  <option value="">-- Choose a Customer --</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-650">Select Item</label>
                <select
                  required
                  value={selectedItemId}
                  onChange={(e) => handleItemChange(e.target.value)}
                  disabled={isExecuting}
                  className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:border-teal-500 focus:outline-none bg-white text-slate-700 disabled:opacity-50"
                >
                  <option value="">-- Choose an Item --</option>
                  {items.map((i) => (
                    <option key={i._id} value={i._id}>
                      {i.name} ({i.sku || "No SKU"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-650">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    disabled={isExecuting}
                    className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:border-teal-500 focus:outline-none text-slate-750 disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-650">Rate (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    disabled={isExecuting}
                    className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:border-teal-500 focus:outline-none text-slate-750 disabled:opacity-50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isExecuting || !selectedCustomerId || !selectedItemId}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    Executing document chain...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Run Document Chain
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Pipelines & Outputs */}
          <div className="lg:col-span-2 space-y-6">
            {/* Visualizer Pipeline Nodes */}
            <div className="border border-slate-200 rounded-2xl bg-white p-5 shadow-2xs space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Workflow Nodes</h4>
              <div className="grid grid-cols-3 gap-2.5 relative">
                {visualPhases.map((p, idx) => {
                  const isPending = p.status === "pending";
                  const isInProgress = p.status === "in_progress";
                  const isCompleted = p.status === "completed";
                  const isFailed = p.status === "failed";
                  const isSkipped = p.status === "skipped";

                  return (
                    <div
                      key={p.phaseIndex}
                      className={cn(
                        "rounded-xl border p-3.5 flex flex-col justify-between transition-all duration-200 min-h-28",
                        isPending && "bg-slate-50 border-slate-200 text-slate-400",
                        isInProgress && "bg-amber-500/5 border-amber-500/30 text-amber-800 shadow-sm animate-pulse",
                        isCompleted && "bg-teal-500/5 border-teal-500/25 text-teal-800 shadow-xs",
                        isFailed && "bg-rose-50 border-rose-200 text-rose-800",
                        isSkipped && "bg-slate-50/50 border-slate-200 border-dashed text-slate-350"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase opacity-80">Step {p.phaseIndex}</span>
                          {isInProgress && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />}
                          {isCompleted && <Check className="h-3.5 w-3.5 text-teal-600 font-bold" />}
                          {isFailed && <X className="h-3.5 w-3.5 text-rose-600 font-bold" />}
                        </div>
                        <h5 className="text-xs font-bold mt-1.5">{p.name}</h5>
                        <p className="text-[10px] opacity-80 mt-0.5 leading-relaxed">{p.description}</p>
                      </div>

                      {isCompleted && p.result && (
                        <div className="mt-2 text-[9px] bg-teal-500/10 text-teal-700 px-2 py-0.5 rounded-md font-semibold select-all font-mono self-start truncate max-w-full">
                          {p.result.salesOrderNumber || p.result.invoiceNumber || p.result.paymentNumber}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error alerts */}
            {workflowError && (
              <div className="border border-rose-200 rounded-2xl bg-rose-50 p-5 space-y-3">
                <div className="flex items-start gap-2 text-rose-800">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold">Workflow Step Failed</h5>
                    <p className="text-xs opacity-90 mt-0.5">{workflowError}</p>
                  </div>
                </div>
                {manualSteps.length > 0 && (
                  <div className="bg-white border border-rose-100 rounded-xl p-3.5 space-y-2 text-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Required Manual Actions</p>
                    <ol className="list-decimal pl-4 space-y-1.5 text-xs">
                      {manualSteps.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Live activity log */}
            <div className="border border-slate-200 rounded-2xl bg-white p-5 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Execution Activity Log</h4>
              <div className="bg-slate-950 rounded-xl p-4 font-mono text-[10px] text-slate-200 h-44 overflow-y-auto space-y-1.5 scrollbar-thin">
                {logs.length === 0 ? (
                  <div className="text-slate-500 italic h-full flex items-center justify-center">
                    Gears idle. Set parameters and click Run to start...
                  </div>
                ) : (
                  logs.map((log, lIdx) => (
                    <div key={lIdx} className="flex gap-2 leading-relaxed">
                      <span className="text-slate-500 font-bold select-none">[{log.timestamp}]</span>
                      <span
                        className={cn(
                          log.type === "success" && "text-emerald-400 font-semibold",
                          log.type === "error" && "text-rose-400 font-semibold",
                          log.type === "warning" && "text-amber-400 font-semibold",
                          log.type === "info" && "text-slate-200"
                        )}
                      >
                        {log.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
