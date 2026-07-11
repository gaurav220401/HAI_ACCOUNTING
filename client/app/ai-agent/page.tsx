"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useChatbot } from "@/contexts/chatbot-context";
import { cn } from "@/lib/utils";
import { 
  Bot, MessageSquare, Send, Sparkles, X, ArrowUpRight, 
  AlertCircle, RefreshCw, Clock, ChevronDown, Check,
  Sliders, Box, Briefcase, Calendar, BarChart3, Download, FileText
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Starter questions
const STARTER_QUESTIONS = [
  "How do I create a new invoice?",
  "What is the purchase order workflow?",
  "How do recurring invoices work?",
  "How do I manage vendor credits?",
];

// Helper to format time
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AIAgentPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, loading: orgLoading } = useOrganization();
  const [activeTab, setActiveTab] = useState<"chat" | "tasks" | "automation" | "analysis" | "history">("chat");

  const {
    messages,
    input,
    setInput,
    isLoading,
    sessionId,
    sessions,
    sessionsLoading,
    sendMessage,
    handleNewChat,
    fetchSessions,
    handleLoadSession,
  } = useChatbot();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Fetch history list when tab or page opens
  useEffect(() => {
    if (activeTab === "chat") {
      fetchSessions();
    }
  }, [activeTab, fetchSessions]);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push("/login");
    }
  }, [loading, firebaseUser, router]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900">
        <RefreshCw className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-hidden bg-slate-900 text-slate-100">
          <PageHeader
            breadcrumb={
              <span className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wide">AI Assistant</span>
                <span className="text-sm font-semibold text-slate-200 mt-0.5 animate-ai-gradient-text">Nemo Dashboard</span>
              </span>
            }
          />

          {/* ── Tabs Navigation ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              {[
                { id: "chat", label: "🤖 Agent Chat" },
                { id: "tasks", label: "⚡ Tasks" },
                { id: "automation", label: "🔄 Automation" },
                { id: "analysis", label: "📊 Item Analysis" },
                { id: "history", label: "📜 History" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                    activeTab === tab.id
                      ? "bg-teal-600 text-white shadow-md shadow-teal-600/10"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content Area ── */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "chat" && (
              <div className="flex h-full overflow-hidden">
                {/* Chat Session Sidebar */}
                <div className="w-64 shrink-0 border-r border-slate-800 bg-slate-950/60 p-4 flex flex-col gap-4">
                  <button
                    onClick={handleNewChat}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-teal-600/15 hover:bg-teal-700 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    New Conversation
                  </button>

                  <div className="flex-1 overflow-y-auto">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 px-2">Recent Chats</p>
                    {sessionsLoading ? (
                      <div className="space-y-2.5 animate-pulse px-2">
                        <div className="h-4 bg-slate-800 rounded w-4/5" />
                        <div className="h-4 bg-slate-800 rounded w-2/3" />
                      </div>
                    ) : sessions.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">No recent conversations.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {sessions.map((sess) => (
                          <button
                            key={sess._id}
                            onClick={() => handleLoadSession(sess._id)}
                            className={cn(
                              "w-full text-left p-2.5 rounded-xl transition-all flex flex-col gap-1 border border-transparent",
                              sessionId === sess._id
                                ? "bg-teal-500/10 border-teal-500/20 text-teal-400 font-semibold"
                                : "text-slate-400 hover:bg-slate-900 hover:text-slate-300"
                            )}
                          >
                            <span className="text-xs truncate block w-full">{sess.title || "Untitled Chat"}</span>
                            <span className="text-[9px] text-slate-500">
                              {new Date(sess.updatedAt || sess.lastActivity || sess.createdAt).toLocaleDateString()}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Main Chat Display */}
                <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-lg shadow-teal-500/20">
                          <Sparkles className="h-7 w-7 text-white" />
                        </div>
                        <h3 className="text-base font-bold text-slate-200">Hi, I'm Nemo</h3>
                        <p className="text-xs text-slate-400 text-center mt-1 mb-6 leading-relaxed">
                          Your synchronized AI Accounting Assistant. Let's work together to manage invoices, analyze products, and automate workflows.
                        </p>
                        <div className="w-full grid grid-cols-2 gap-3">
                          {STARTER_QUESTIONS.map((q) => (
                            <button
                              key={q}
                              onClick={() => sendMessage(q)}
                              className="p-3 text-left rounded-xl border border-slate-800 bg-slate-950/40 text-xs text-slate-300 hover:border-teal-500/30 hover:bg-teal-500/5 transition-all cursor-pointer flex items-start gap-2"
                            >
                              <MessageSquare className="h-4 w-4 shrink-0 text-teal-500 mt-0.5" />
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-3xl mx-auto space-y-4">
                        {messages.map((msg, i) => {
                          const isUser = msg.role === "user";
                          return (
                            <div key={i} className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
                              {!isUser && (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 shadow-md">
                                  <Bot className="h-4 w-4 text-white" />
                                </div>
                              )}
                              <div className={cn("max-w-[80%] space-y-1", isUser && "flex flex-col items-end")}>
                                <div
                                  className={cn(
                                    "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                                    isUser
                                      ? "bg-teal-600 text-white rounded-br-md shadow-md"
                                      : "bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-md"
                                  )}
                                >
                                  {isUser ? (
                                    <p>{msg.content}</p>
                                  ) : (
                                    <div className="prose prose-invert prose-sm max-w-none">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                          strong: ({ ...props }) => <strong className="font-bold text-teal-400" {...props} />,
                                          h1: ({ ...props }) => <h3 className="text-sm font-bold text-teal-300 mt-2 mb-1" {...props} />,
                                          h2: ({ ...props }) => <h3 className="text-sm font-bold text-teal-300 mt-2 mb-1" {...props} />,
                                          h3: ({ ...props }) => <h3 className="text-sm font-bold text-teal-300 mt-2 mb-1" {...props} />,
                                          ul: ({ ...props }) => <ul className="list-disc pl-4 space-y-1 my-1" {...props} />,
                                          ol: ({ ...props }) => <ol className="list-decimal pl-4 space-y-1 my-1" {...props} />,
                                          li: ({ ...props }) => <li className="text-slate-300" {...props} />,
                                          a: ({ ...props }) => <a className="text-teal-400 underline hover:text-teal-300" {...props} />,
                                          p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />
                                        }}
                                      >
                                        {msg.content}
                                      </ReactMarkdown>
                                    </div>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500 px-1">{formatTime(msg.timestamp)}</span>
                              </div>
                            </div>
                          );
                        })}
                        {isLoading && (
                          <div className="flex gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700">
                              <Bot className="h-4 w-4 text-white" />
                            </div>
                            <div className="bg-slate-950 border border-slate-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500 [animation-delay:0ms]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500 [animation-delay:150ms]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500 [animation-delay:300ms]" />
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Input form */}
                  <div className="p-4 border-t border-slate-800 bg-slate-950/40">
                    <div className="max-w-3xl mx-auto flex gap-3 items-end bg-slate-950 border border-slate-850 rounded-2xl p-2 focus-within:border-teal-500 transition-colors">
                      <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message to Nemo..."
                        disabled={isLoading}
                        className="flex-1 bg-transparent border-0 resize-none py-1.5 px-3 text-sm focus:outline-none placeholder-slate-500 text-slate-100 disabled:opacity-50 max-h-24 overflow-y-auto"
                      />
                      <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || isLoading}
                        className={cn(
                          "h-8 w-8 rounded-xl flex items-center justify-center cursor-pointer transition-all shrink-0",
                          input.trim() && !isLoading
                            ? "bg-teal-600 hover:bg-teal-700 text-white"
                            : "bg-slate-800 text-slate-600"
                        )}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "tasks" && (
              <div className="h-full overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-200">Guided Agentic Tasks</h2>
                    <p className="text-xs text-slate-400 mt-1">Select an automated task flow below. Nemo will guide you step-by-step.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      {
                        title: "Create Item with AI",
                        desc: "Nemo will ask you questions and automatically fill in the accounting item form.",
                        icon: Box,
                        badge: "Available in Phase 4"
                      },
                      {
                        title: "Sales to Payment Chain",
                        desc: "AI constructs SO, Invoice and Bills, and automatically records transaction entries.",
                        icon: Sliders,
                        badge: "Available in Phase 4"
                      },
                      {
                        title: "Item Analysis Insights",
                        desc: "Analyze your inventory stock levels, categories, and generate insight summaries.",
                        icon: BarChart3,
                        badge: "Available in Phase 4"
                      },
                      {
                        title: "Export & Format Assistant",
                        desc: "AI helps map fields and export reports to formatted CSV or Excel documents.",
                        icon: Download,
                        badge: "Available in Phase 4"
                      }
                    ].map((card, i) => (
                      <div key={i} className="relative rounded-2xl border border-slate-800 bg-slate-950/40 p-5 flex flex-col justify-between hover:border-slate-700 transition-colors">
                        <div>
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-teal-400 mb-4">
                            <card.icon className="h-5 w-5" />
                          </div>
                          <h3 className="text-sm font-semibold text-slate-200">{card.title}</h3>
                          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{card.desc}</p>
                        </div>
                        <div className="mt-6 flex items-center justify-between border-t border-slate-900 pt-3">
                          <span className="text-[10px] font-semibold text-teal-400/70 bg-teal-500/5 px-2.5 py-0.5 rounded-full border border-teal-500/10">
                            {card.badge}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "automation" && (
              <div className="h-full flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-3">
                  <Sliders className="h-10 w-10 text-slate-500 mx-auto animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-300">Document Workflow Automation</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Visual orchestration pipeline. Create complex Sales-to-Payment document workflow automation chains. This visual builder will be implemented in Phase 4.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "analysis" && (
              <div className="h-full flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-3">
                  <BarChart3 className="h-10 w-10 text-slate-500 mx-auto animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-300">Item Analysis Insights</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    AI inventory health analysis dashboard. Track stock velocity, margins, and automatically forecast stock orders. This dashboard will be implemented in Phase 4.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "history" && (
              <div className="h-full flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-3">
                  <FileText className="h-10 w-10 text-slate-500 mx-auto animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-300">Agentic Action History Log</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Review and rerun past automated agentic actions. Review audit logs of item creations and batch transfers. This history list will be implemented in Phase 4.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
