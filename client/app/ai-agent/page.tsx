"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { RefreshCw, MessageSquare, ListTodo, Shuffle, BarChart3, History } from "lucide-react";

// Import modular Phase 4 components
import { AgentChat } from "@/components/ai-agent/agent-chat";
import { AgentTaskPanel } from "@/components/ai-agent/agent-task-panel";
import { AgentWorkflowVisualizer } from "@/components/ai-agent/agent-workflow-visualizer";
import { AgentItemAnalysis } from "@/components/ai-agent/agent-item-analysis";
import { AgentHistory } from "@/components/ai-agent/agent-history";

export default function AIAgentPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, loading: orgLoading } = useOrganization();
  const [activeTab, setActiveTab] = useState<"chat" | "tasks" | "automation" | "analysis" | "history">("chat");

  // Parse URL search parameters on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam && ["chat", "tasks", "automation", "analysis", "history"].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push("/login");
    }
  }, [loading, firebaseUser, router]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-hidden bg-slate-50/50 text-slate-800">
          <PageHeader
            breadcrumb={
              <span className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wide">AI Assistant</span>
                <span className="text-sm font-semibold text-slate-700 mt-0.5 animate-ai-gradient-text">Nemo Dashboard</span>
              </span>
            }
          />

          {/* ── Tabs Navigation ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-6 py-2">
            <div className="flex items-center gap-2 overflow-x-auto">
              {[
                { id: "chat", label: "Chat", icon: MessageSquare },
                { id: "tasks", label: "Tasks", icon: ListTodo },
                { id: "automation", label: "Automation", icon: Shuffle },
                { id: "analysis", label: "Item Analysis", icon: BarChart3 },
                { id: "history", label: "History", icon: History },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2",
                      activeTab === tab.id
                        ? "bg-teal-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Content Area ── */}
          <div className="flex-1 overflow-hidden bg-white">
            {activeTab === "chat" && <AgentChat />}
            {activeTab === "tasks" && <AgentTaskPanel />}
            {activeTab === "automation" && (
              <div className="h-full overflow-y-auto p-6">
                <AgentWorkflowVisualizer />
              </div>
            )}
            {activeTab === "analysis" && (
              <div className="h-full overflow-y-auto">
                <AgentItemAnalysis />
              </div>
            )}
            {activeTab === "history" && <AgentHistory />}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
