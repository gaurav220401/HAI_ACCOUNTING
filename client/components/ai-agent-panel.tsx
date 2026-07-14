"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Wand2,
  Sparkles,
  Send,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Cpu,
  ArrowRight,
  ExternalLink,
  Zap,
  RotateCcw,
  UserPlus,
  FileText,
  PackagePlus,
  Receipt,
  DollarSign,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendAgentInstruction, type AgentMessage, type AgentToolStep } from "@/lib/api/agent";
import { dispatchAgentAutofill } from "@/hooks/use-agent-autofill";
import { cn } from "@/lib/utils";

// ─── Starter Agent Tasks ────────────────────────────────────────────────

const STARTER_AGENT_TASKS = [
  {
    icon: UserPlus,
    label: "Create New Customer",
    prompt: "Create a new customer named 'Apex Digital Tech' with email 'billing@apexdigital.com' and GSTIN '27AAACA1234A1Z1'.",
  },
  {
    icon: FileText,
    label: "Create Tax Invoice",
    prompt: "Create an invoice for Apex Digital Tech for 'Software Consulting' worth ₹35,000.",
  },
  {
    icon: Receipt,
    label: "Log Business Expense",
    prompt: "Log an expense of ₹4,500 for 'Office Maintenance' paid via Bank Account.",
  },
  {
    icon: PackagePlus,
    label: "Add Inventory Item",
    prompt: "Add a new inventory item 'Mechanical Keyboard' with SKU 'KB-MK01', selling price ₹2,499, and initial stock of 15 units.",
  },
];

// ─── Tool Execution Step Component ─────────────────────────────────────

function ToolExecutionStep({ step }: { step: AgentToolStep }) {
  const isExecuting = step.status === "executing";
  const isCompleted = step.status === "completed";
  const isFailed = step.status === "failed";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 text-xs shadow-2xs">
      {isExecuting && <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600 shrink-0" />}
      {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
      {isFailed && <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />}

      <div className="flex-1 min-w-0">
        <span className="font-semibold text-slate-800">
          {step.toolName.replace(/_/g, " ").toUpperCase()}
        </span>
        {step.args && Object.keys(step.args).length > 0 && (
          <span className="ml-1.5 text-[11px] text-slate-500 truncate inline-block max-w-[200px]">
            ({JSON.stringify(step.args).replace(/["{}]/g, "")})
          </span>
        )}
      </div>

      {isCompleted && <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Done</span>}
      {isFailed && <span className="text-[10px] font-medium text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">Failed</span>}
    </div>
  );
}

// ─── Form Autofill Card Component ─────────────────────────────────────

function AutofillCard({
  autofill,
}: {
  autofill: NonNullable<AgentMessage["formAutofill"]>;
}) {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    dispatchAgentAutofill(autofill);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  return (
    <div className="mt-2.5 rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50/50 p-3 shadow-2xs">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-purple-600 animate-pulse" />
          <span className="text-xs font-bold text-purple-900 uppercase tracking-wide">
            Form Pre-fill Available ({autofill.formType})
          </span>
        </div>
        <button
          type="button"
          onClick={handleApply}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer shadow-2xs",
            applied
              ? "bg-emerald-600 text-white"
              : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700"
          )}
        >
          {applied ? (
            <>
              <CheckCircle2 className="h-3 w-3" /> Auto-filled!
            </>
          ) : (
            <>
              <ExternalLink className="h-3 w-3" /> Apply to Form
            </>
          )}
        </button>
      </div>
      <p className="text-[11px] text-purple-800 leading-normal">
        The agent generated form data for standard creation. Click above to populate fields directly in your workflow.
      </p>
    </div>
  );
}

// ─── Agent Message Bubble ──────────────────────────────────────────────

function AgentMessageBubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === "user";

  if (message.isError) {
    return (
      <div className="px-4 py-1.5">
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs leading-relaxed text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Execution Failed</span>
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2.5 px-4 py-2", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 shadow-md shadow-purple-500/20 text-white">
          <Cpu className="h-4 w-4" />
        </div>
      )}

      <div className={cn("max-w-[85%] space-y-2", isUser && "flex flex-col items-end")}>
        {/* Main Content Bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-2xs",
            isUser
              ? "rounded-br-xs bg-gradient-to-r from-purple-700 to-indigo-700 text-white"
              : "rounded-bl-xs border border-slate-200/70 bg-white text-slate-800"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-chatbot prose prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  strong: ({ node, ...props }) => <strong className="font-bold text-purple-950" {...props} />,
                  h1: ({ node, ...props }) => <h3 className="text-sm font-bold text-purple-900 mt-2 mb-1" {...props} />,
                  h2: ({ node, ...props }) => <h3 className="text-sm font-bold text-purple-900 mt-2 mb-1" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-purple-900 mt-2 mb-1" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc pl-4 space-y-1 my-1" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal pl-4 space-y-1 my-1" {...props} />,
                  li: ({ node, ...props }) => <li className="text-slate-700 marker:text-purple-500" {...props} />,
                  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Render Tool Step Indicators */}
        {!isUser && message.toolSteps && message.toolSteps.length > 0 && (
          <div className="space-y-1.5 w-full">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1">
              Actions Executed ({message.toolSteps.length})
            </span>
            {message.toolSteps.map((step, idx) => (
              <ToolExecutionStep key={idx} step={step} />
            ))}
          </div>
        )}

        {/* Render Form Autofill Card */}
        {!isUser && message.formAutofill && (
          <AutofillCard autofill={message.formAutofill} />
        )}
      </div>
    </div>
  );
}

// ─── Agent Panel Props ─────────────────────────────────────────────────

interface AIAgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIAgentPanel({ isOpen, onClose }: AIAgentPanelProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isExecuting]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const executeTask = useCallback(
    async (taskText?: string) => {
      const instruction = (taskText || input).trim();
      if (!instruction || isExecuting) return;

      const userMsg: AgentMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: instruction,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsExecuting(true);

      try {
        const res = await sendAgentInstruction(instruction, sessionId);

        if (res.success && res.data) {
          if (res.data.sessionId) setSessionId(res.data.sessionId);

          const assistantMsg: AgentMessage = {
            id: `agent_${Date.now()}`,
            role: "assistant",
            content: res.data.answer,
            toolSteps: res.data.toolSteps,
            formAutofill: res.data.formAutofill,
            timestamp: Date.now(),
          };

          setMessages((prev) => [...prev, assistantMsg]);

          // Auto-dispatch form pre-fill event if returned
          if (res.data.formAutofill) {
            dispatchAgentAutofill(res.data.formAutofill);
          }
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              role: "assistant",
              content: res.message || "Failed to process agent instruction.",
              timestamp: Date.now(),
              isError: true,
            },
          ]);
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: "assistant",
            content: "Connection error with AI Agent service.",
            timestamp: Date.now(),
            isError: true,
          },
        ]);
      } finally {
        setIsExecuting(false);
      }
    },
    [input, isExecuting, sessionId]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      executeTask();
    }
  };

  const handleResetSession = () => {
    setMessages([]);
    setSessionId(undefined);
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-2xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Slide-out Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-[1000] flex h-screen w-full flex-col border-l border-slate-200 bg-slate-50/50 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out sm:w-[480px]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* ── Header ── */}
        <div className="flex h-16 shrink-0 items-center justify-between bg-gradient-to-r from-indigo-700 via-purple-700 to-violet-800 px-5 shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white shadow-inner backdrop-blur-md">
              <Wand2 className="h-5 w-5 text-purple-200 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold tracking-wide text-white">HAI AI Task Agent</h2>
                <span className="rounded-full bg-purple-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-purple-200 border border-purple-300/30">
                  Autonomous
                </span>
              </div>
              <p className="text-[11px] font-medium text-purple-200/80">
                Executes tasks, creates data & populates forms automatically
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleResetSession}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
              title="Reset Agent Session"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
              title="Close Panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto scroll-smooth py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-600 to-violet-700 shadow-xl shadow-purple-500/25 text-white">
                <Sparkles className="h-8 w-8 text-yellow-300" />
              </div>
              <h3 className="mb-1 text-base font-extrabold text-slate-900">What would you like me to do?</h3>
              <p className="mb-6 max-w-sm text-xs leading-relaxed text-slate-500">
                I can create customers, invoices, bills, inventory items, log expenses, and auto-fill complex forms for you automatically.
              </p>

              <div className="w-full space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block text-left px-1">
                  Popular Agent Tasks
                </span>
                {STARTER_AGENT_TASKS.map((task, idx) => {
                  const IconComp = task.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => executeTask(task.prompt)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 text-left shadow-2xs transition-all hover:border-purple-300 hover:bg-purple-50/40 hover:shadow-md cursor-pointer group"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <IconComp className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 group-hover:text-purple-900">
                          {task.label}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {task.prompt}
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-purple-600 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <AgentMessageBubble key={msg.id} message={msg} />
              ))}

              {isExecuting && (
                <div className="flex items-center gap-3 px-4 py-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-purple-100 bg-purple-50/80 px-4 py-2.5 text-xs font-semibold text-purple-900">
                    <Cpu className="h-3.5 w-3.5 animate-pulse text-purple-600" />
                    Executing agent workflow & tools...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input Bar ── */}
        <div className="shrink-0 border-t border-slate-200/80 bg-white p-4 shadow-lg">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-2 transition-all focus-within:border-purple-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-purple-500/20">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell the AI Agent what to do..."
              disabled={isExecuting}
              className="flex-1 bg-transparent text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 outline-none disabled:opacity-50 font-medium"
            />
            <button
              type="button"
              onClick={() => executeTask()}
              disabled={!input.trim() || isExecuting}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all cursor-pointer shadow-md",
                input.trim() && !isExecuting
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 active:scale-95"
                  : "bg-slate-200 text-slate-400 shadow-none"
              )}
              title="Execute Task"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] font-medium text-slate-400">
            HAI AI Agent executes verified actions across your business modules
          </p>
        </div>
      </div>
    </>
  );
}
