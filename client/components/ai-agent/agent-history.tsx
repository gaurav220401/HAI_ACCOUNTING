"use client";

import { useEffect, useState } from "react";
import { listAgentTasks, getAgentTask, type AgentTask } from "@/lib/api/ai-agent";
import { cn } from "@/lib/utils";
import { Clock, Eye, AlertCircle, RefreshCw, X, ChevronDown, Check } from "lucide-react";

export function AgentHistory() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [openPhaseIdx, setOpenPhaseIdx] = useState<number | null>(null);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await listAgentTasks();
      if (res.success && res.data) {
        setTasks(res.data);
      }
    } catch (err) {
      console.error("Failed to load task history:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleOpenDetails = async (task: AgentTask) => {
    setSelectedTask(task);
    setLoadingDetails(true);
    setOpenPhaseIdx(null);
    try {
      const res = await getAgentTask(task._id);
      if (res.success && res.data) {
        setSelectedTask(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch task details:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const getStatusBadge = (status: AgentTask["status"]) => {
    const styles: Record<string, string> = {
      pending: "bg-slate-100 text-slate-700 border-slate-200",
      in_progress: "bg-amber-50 text-amber-700 border-amber-200 animate-pulse",
      completed: "bg-teal-50 text-teal-700 border-teal-200",
      failed: "bg-rose-50 text-rose-700 border-rose-200",
      partial: "bg-orange-50 text-orange-700 border-orange-200",
    };
    return (
      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", styles[status] || styles.pending)}>
        {status.replace("_", " ")}
      </span>
    );
  };

  const getPhaseStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-slate-100 text-slate-600",
      in_progress: "bg-amber-100 text-amber-700 animate-pulse",
      completed: "bg-teal-100 text-teal-700",
      failed: "bg-rose-100 text-rose-700",
      skipped: "bg-slate-150 text-slate-500",
    };
    return (
      <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md", styles[status] || styles.pending)}>
        {status}
      </span>
    );
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Task List Table */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/20">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-800">Agent Task Execution Log</h3>
              <p className="text-xs text-slate-550 mt-0.5">Audit trail of all guided and background agentic operations.</p>
            </div>
            <button
              onClick={fetchTasks}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold px-3 py-1.5 text-slate-700 shadow-3xs cursor-pointer transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3.5 animate-pulse py-6">
              <div className="h-10 bg-slate-200 rounded-xl" />
              <div className="h-10 bg-slate-200 rounded-xl" />
              <div className="h-10 bg-slate-200 rounded-xl" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 border border-slate-200 border-dashed rounded-2xl bg-white text-slate-450 text-xs">
              <Clock className="h-8 w-8 text-slate-350 mx-auto mb-2" />
              No background tasks logged for this organization.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl bg-white shadow-3xs overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                    <th className="p-3">Task Title</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((task) => (
                    <tr key={task._id} className="hover:bg-slate-50/50 text-slate-750">
                      <td className="p-3 font-semibold truncate max-w-xs">{task.title}</td>
                      <td className="p-3 text-[10px] text-slate-500 font-medium capitalize">
                        {task.taskType.replace("_", " ")}
                      </td>
                      <td className="p-3">{getStatusBadge(task.status)}</td>
                      <td className="p-3 text-slate-450">
                        {new Date(task.createdAt).toLocaleDateString()} at{" "}
                        {new Date(task.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenDetails(task)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-650 hover:text-teal-700 bg-teal-50 hover:bg-teal-100/70 border border-teal-100 rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Details Slide-out Drawer */}
      {selectedTask && (
        <>
          <div className="fixed inset-0 z-40 bg-black/15 backdrop-blur-[1px]" onClick={() => setSelectedTask(null)} />
          <div className="fixed right-0 top-[3.5rem] z-50 flex h-[calc(100vh-3.5rem)] w-full sm:w-[500px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300">
            {/* Drawer Header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-5">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Task Details</h4>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedTask._id}</p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-800">{selectedTask.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{selectedTask.description}</p>
                <div className="flex items-center gap-2 pt-1.5">
                  {getStatusBadge(selectedTask.status)}
                  <span className="text-[10px] text-slate-405">
                    Logged {new Date(selectedTask.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Phases status list */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Execution Phases</h5>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-slate-50/20">
                  {loadingDetails ? (
                    <div className="p-4 space-y-2 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-1/3" />
                      <div className="h-3.5 bg-slate-200 rounded w-2/3" />
                    </div>
                  ) : (
                    selectedTask.phases.map((p, pIdx) => {
                      const isOpen = openPhaseIdx === pIdx;
                      return (
                        <div key={p.phaseIndex} className="bg-white">
                          <button
                            onClick={() => setOpenPhaseIdx(isOpen ? null : pIdx)}
                            className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50/60 transition-colors cursor-pointer"
                          >
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 block">PHASE {p.phaseIndex}</span>
                              <span className="text-xs font-semibold text-slate-700">{p.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {getPhaseStatusBadge(p.status)}
                              <ChevronDown className={cn("h-3.5 w-3.5 text-slate-450 transition-transform duration-200", isOpen && "rotate-180")} />
                            </div>
                          </button>

                          {isOpen && (
                            <div className="p-3.5 border-t border-slate-100 bg-slate-50/40 text-xs text-slate-650 space-y-2.5">
                              <p className="italic text-[11px]">{p.description}</p>
                              {p.errorMessage && (
                                <div className="p-2.5 border border-rose-250 bg-rose-50 text-rose-800 text-[11px] rounded-lg flex items-start gap-1.5">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  {p.errorMessage}
                                </div>
                              )}
                              {p.manualSteps && p.manualSteps.length > 0 && (
                                <div className="bg-white border border-slate-150 rounded-lg p-3 space-y-1.5 text-slate-750">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-rose-700">Manual Steps to Fix</p>
                                  <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                                    {p.manualSteps.map((step, sIdx) => (
                                      <li key={sIdx}>{step}</li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                              {p.result && (
                                <div className="space-y-1">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Step Result</p>
                                  <pre className="p-2.5 bg-slate-900 text-slate-300 font-mono text-[9px] rounded-lg overflow-x-auto max-h-36">
                                    {JSON.stringify(p.result, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Final output */}
              {selectedTask.output && !loadingDetails && (
                <div className="space-y-2">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Final Output Payload</h5>
                  <pre className="p-3 bg-slate-900 text-teal-400 font-mono text-[10px] rounded-xl overflow-x-auto max-h-44 shadow-inner">
                    {JSON.stringify(selectedTask.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
