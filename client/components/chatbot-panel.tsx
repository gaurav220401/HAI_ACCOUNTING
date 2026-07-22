"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  MessageSquare,
  Send,
  Sparkles,
  X,
  ArrowUpRight,
  AlertCircle,
  ExternalLink,
  Compass,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Zap,
  UserPlus,
  FileText,
  PackagePlus,
  Receipt,
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendChatMessage, type ChatMessage, type ChatNavigationAction, type ChatModelProvider } from "@/lib/api/chatbot";
import type { AgentExecutionStep, AgentMessage, AgentToolStep } from "@/lib/api/agent";
import { dispatchAgentAutofill } from "@/hooks/use-agent-autofill";
import { cn } from "@/lib/utils";

// ─── Suggested Starter Questions ───────────────────────────────────────

const STARTER_QUESTIONS = [
  { text: "How do I create a new invoice?", icon: MessageSquare },
  { text: "Take me to record an expense", icon: Compass },
  { text: "What is the purchase order workflow?", icon: MessageSquare },
  { text: "I want to add a new customer", icon: Compass },
];

const STARTER_TASKS = [
  {
    icon: UserPlus,
    label: "How do I create a customer?",
    prompt: "How do I create a new customer named 'Apex Digital Tech' with email 'billing@apexdigital.com' and GSTIN '27AAACA1234A1Z1'?",
  },
  {
    icon: FileText,
    label: "How do I create an invoice?",
    prompt: "How do I create an invoice for Apex Digital Tech for 'Software Consulting' worth ₹35,000?",
  },
  {
    icon: Receipt,
    label: "How do I record an expense?",
    prompt: "How do I record an expense of ₹4,500 for 'Office Maintenance' paid via Bank Account?",
  },
  {
    icon: PackagePlus,
    label: "How do I add an item?",
    prompt: "How do I add a new inventory item 'Mechanical Keyboard' with SKU 'KB-MK01', selling price ₹2,499, and initial stock of 15 units?",
  },
];

type NemoMessage = ChatMessage & {
  toolSteps?: AgentToolStep[];
  formAutofill?: AgentMessage["formAutofill"];
  executionPlan?: AgentExecutionStep[];
};

// ─── Typing Indicator ──────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-teal-500 to-teal-700 shadow-sm">
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-100 bg-slate-50 px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// ─── Navigation Action Buttons ─────────────────────────────────────────

function ActionButtons({
  actions,
  onNavigate,
}: {
  actions: ChatNavigationAction[];
  onNavigate: (url: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {actions.map((action, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onNavigate(action.url)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-linear-to-r from-teal-50 to-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-teal-800 shadow-sm transition-all hover:from-teal-100 hover:to-emerald-100 hover:border-teal-300 hover:shadow-md active:scale-[0.97] cursor-pointer group"
        >
          <ExternalLink className="h-3 w-3 text-teal-600 group-hover:text-teal-700 transition-colors" />
          {action.label}
        </button>
      ))}
    </div>
  );
}

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
          <span className="ml-1.5 inline-block max-w-50 truncate text-[11px] text-slate-500">
            ({JSON.stringify(step.args).replace(/["{}]/g, "")})
          </span>
        )}
      </div>

      {isCompleted && <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Done</span>}
      {isFailed && <span className="text-[10px] font-medium text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">Failed</span>}
    </div>
  );
}

function AutofillCard({
  autofill,
  onApply,
}: {
  autofill: NonNullable<AgentMessage["formAutofill"]>;
  onApply: () => void;
}) {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    onApply();
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  return (
    <div className="mt-2.5 rounded-xl border border-purple-200 bg-linear-to-r from-purple-50 to-indigo-50/50 p-3 shadow-2xs">
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
              : "bg-linear-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700"
          )}
        >
          {applied ? (
            <>
              <CheckCircle2 className="h-3 w-3" /> Auto-applied
            </>
          ) : (
            <>
              <ExternalLink className="h-3 w-3" /> Apply to Form
            </>
          )}
        </button>
      </div>
      <p className="text-[11px] text-purple-800 leading-normal">
        Nemo generated the form data for this task. Apply it to the matching form page to continue.
      </p>
    </div>
  );
}

function TaskCard({
  label,
  prompt,
  icon: IconComp,
  onExecute,
}: {
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
  onExecute: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExecute}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 text-left shadow-2xs transition-all hover:border-purple-300 hover:bg-purple-50/40 hover:shadow-md cursor-pointer group"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white transition-colors">
        <IconComp className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-slate-800 group-hover:text-purple-900">
          {label}
        </div>
        <div className="text-[11px] text-slate-500 truncate mt-0.5">
          {prompt}
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-purple-600 shrink-0" />
    </button>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────

function MessageBubble({
  message,
  onSourceClick,
  onNavigate,
  onAutofill,
}: {
  message: NemoMessage;
  onSourceClick?: (title: string) => void;
  onNavigate?: (url: string) => void;
  onAutofill?: (autofill: NonNullable<AgentMessage["formAutofill"]>) => void;
}) {
  const isUser = message.role === "user";

  if (message.isError) {
    return (
      <div className="px-4 py-1.5">
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <p className="text-xs leading-relaxed text-rose-700">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2.5 px-4 py-1.5", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-teal-500 to-teal-700 shadow-sm">
          <Bot className="h-3.5 w-3.5 text-white" />
        </div>
      )}

      <div className={cn("max-w-[85%] space-y-1.5", isUser && "flex flex-col items-end")}>
        {/* Bubble */}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
            isUser
              ? "rounded-br-md bg-teal-600 text-white shadow-sm"
              : "rounded-bl-md border border-slate-100 bg-slate-50 text-slate-800"
          )}
        >
          {/* Render markdown-like content for bot messages */}
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose-chatbot prose prose-sm max-w-none">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  strong: ({ node, ...props }) => {
                    void node;
                    return <strong className="font-bold text-teal-900" {...props} />;
                  },
                  em: ({ node, ...props }) => {
                    void node;
                    return <em className="italic text-teal-800" {...props} />;
                  },
                  h1: ({ node, ...props }) => {
                    void node;
                    return <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />;
                  },
                  h2: ({ node, ...props }) => {
                    void node;
                    return <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />;
                  },
                  h3: ({ node, ...props }) => {
                    void node;
                    return <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />;
                  },
                  ul: ({ node, ...props }) => {
                    void node;
                    return <ul className="list-disc pl-4 space-y-1 my-1" {...props} />;
                  },
                  ol: ({ node, ...props }) => {
                    void node;
                    return <ol className="list-decimal pl-4 space-y-1 my-1" {...props} />;
                  },
                  li: ({ node, ...props }) => {
                    void node;
                    return <li className="text-slate-700 marker:text-teal-500" {...props} />;
                  },
                  a: ({ node, ...props }) => {
                    void node;
                    return <a className="text-teal-600 underline hover:text-teal-800" {...props} />;
                  },
                  p: ({ node, ...props }) => {
                    void node;
                    return <p className="mb-2 last:mb-0" {...props} />;
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Navigation Action Buttons */}
        {!isUser && message.actions && message.actions.length > 0 && onNavigate && (
          <ActionButtons actions={message.actions} onNavigate={onNavigate} />
        )}

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

        {!isUser && message.formAutofill && onAutofill && (
          <AutofillCard autofill={message.formAutofill} onApply={() => onAutofill(message.formAutofill!)} />
        )}

        {/* Source chips */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-0.5">
            {message.sources.map((source, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSourceClick?.(source.title)}
                className="inline-flex items-center gap-1 rounded-full border border-teal-100 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 transition-colors hover:bg-teal-100 hover:border-teal-200 cursor-pointer"
              >
                <ArrowUpRight className="h-2.5 w-2.5" />
                {source.title}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className={cn("text-[10px] text-slate-400 px-1", isUser && "text-right")}>
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

// ─── Format Helpers ────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Welcome / Empty State ─────────────────────────────────────────────

function WelcomeState({ onQuestionClick }: { onQuestionClick: (q: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-teal-500 to-teal-700 shadow-lg shadow-teal-500/20">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h3 className="mb-1 text-base font-bold text-slate-900">Nemo</h3>
      <p className="mb-6 text-center text-xs leading-relaxed text-slate-500">
        Ask me anything about HAI Accounting or tell me what you want to do.
        <br />
        I can explain the steps and take you to the right page.
      </p>

      <div className="w-full space-y-4">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Try asking
          </p>
          {STARTER_QUESTIONS.map((q) => {
            const IconComp = q.icon;
            return (
              <button
                key={q.text}
                type="button"
                onClick={() => onQuestionClick(q.text)}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left text-xs text-slate-600 shadow-2xs transition-all hover:border-teal-200 hover:bg-teal-50/30 hover:text-teal-700 cursor-pointer"
              >
                <IconComp className="h-3.5 w-3.5 shrink-0 text-teal-500" />
                {q.text}
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Try asking
          </p>
          {STARTER_TASKS.map((task) => (
            <TaskCard
              key={task.label}
              label={task.label}
              prompt={task.prompt}
              icon={task.icon}
              onExecute={() => onQuestionClick(task.prompt)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shimmer Skeleton ──────────────────────────────────────────────────

function ChatSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-6">
      {/* Bot message skeleton */}
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 animate-pulse rounded-full bg-slate-200" />
        <div className="space-y-1.5">
          <div className="h-16 w-56 animate-pulse rounded-2xl rounded-bl-md bg-slate-100" />
          <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      {/* User message skeleton */}
      <div className="flex flex-row-reverse items-start gap-2.5">
        <div className="space-y-1.5 flex flex-col items-end">
          <div className="h-10 w-44 animate-pulse rounded-2xl rounded-br-md bg-teal-100" />
          <div className="h-3 w-14 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      {/* Another bot message skeleton */}
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 animate-pulse rounded-full bg-slate-200" />
        <div className="space-y-1.5">
          <div className="h-24 w-64 animate-pulse rounded-2xl rounded-bl-md bg-slate-100" />
          <div className="flex gap-1.5">
            <div className="h-5 w-16 animate-pulse rounded-full bg-teal-50" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-teal-50" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Chat Panel ───────────────────────────────────────────────────

interface ChatbotPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatbotPanel({ isOpen, onClose }: ChatbotPanelProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<NemoMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [selectedProvider, setSelectedProvider] = useState<ChatModelProvider>(() => {
    if (typeof window === "undefined") return "gemini";
    const savedProvider = window.localStorage.getItem("hai_chat_provider");
    return savedProvider === "groq" ? "groq" : "gemini";
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Simulate initialization complete
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsInitializing(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isInitializing) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isInitializing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("hai_chat_provider", selectedProvider);
  }, [selectedProvider]);

  // Handle navigation from action buttons
  const handleNavigate = useCallback(
    (url: string) => {
      router.push(url);
      onClose();
    },
    [router, onClose]
  );

  const handleAutofill = useCallback(
    (autofill: NonNullable<AgentMessage["formAutofill"]>) => {
      if (typeof window === "undefined") return;

      const payload = {
        ...autofill,
        executionMode: "api" as const,
      };

      if (autofill.navigationUrl && window.location.pathname !== autofill.navigationUrl) {
        sessionStorage.setItem("hai_pending_autofill", JSON.stringify(payload));
        router.push(autofill.navigationUrl);
        return;
      }

      dispatchAgentAutofill(payload);
    },
    [router]
  );

  const sendMessage = useCallback(
    async (questionText?: string) => {
      const question = (questionText || input).trim();
      if (!question || isLoading) return;

      // Add user message
      const userMessage: NemoMessage = {
        role: "user",
        content: question,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const response = await sendChatMessage(question, sessionId, selectedProvider);

        if (response.success && response.data) {
          if (response.data.sessionId) {
            setSessionId(response.data.sessionId);
          }

          const botMessage: NemoMessage = {
            role: "assistant",
            content: response.data.answer,
            sources: response.data.sources,
            actions: response.data.actions,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, botMessage]);
        } else {
          const errorMessage: NemoMessage = {
            role: "assistant",
            content: response.message || "Something went wrong. Please try again.",
            timestamp: Date.now(),
            isError: true,
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } catch {
        // Network error or server down
        const errorMessage: NemoMessage = {
          role: "assistant",
          content: "Unable to connect to Nemo. Please check your connection and try again.",
          timestamp: Date.now(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [handleAutofill, input, isLoading, selectedProvider, sessionId]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-14 z-50 flex h-[calc(100vh-3.5rem)] w-full flex-col border-l border-slate-200/70 bg-white shadow-2xl transition-transform duration-300 ease-out sm:w-105",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* ── Header ── */}
        <div className="flex h-14 shrink-0 items-center justify-between bg-linear-to-r from-teal-600 to-teal-700 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Nemo</h2>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                <span className="text-[10px] text-teal-100">Online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
              <span className="uppercase tracking-wide text-white/70">Model</span>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as ChatModelProvider)}
                className="bg-transparent text-[10px] font-semibold text-white outline-none"
                aria-label="Select chat model provider"
              >
                <option value="gemini" className="text-slate-900">Gemini</option>
                <option value="groq" className="text-slate-900">Groq</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              title="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Messages Area ── */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          {isInitializing ? (
            <ChatSkeleton />
          ) : messages.length === 0 ? (
            <WelcomeState onQuestionClick={(value) => sendMessage(value)} />
          ) : (
            <div className="py-3">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  message={msg}
                  onSourceClick={(title) => {
                    setInput(title);
                    inputRef.current?.focus();
                  }}
                  onNavigate={handleNavigate}
                  onAutofill={handleAutofill}
                />
              ))}
              {isLoading && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input Area ── */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 transition-colors focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question or tell me where to go..."
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none disabled:opacity-50"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all cursor-pointer",
                input.trim() && !isLoading
                  ? "bg-teal-600 text-white shadow-sm hover:bg-teal-700"
                  : "bg-slate-200 text-slate-400"
              )}
              title="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[9px] text-slate-400">
            Powered by HAI Knowledge Base · I can answer questions & navigate you to pages
          </p>
        </div>
      </div>
    </>
  );
}
