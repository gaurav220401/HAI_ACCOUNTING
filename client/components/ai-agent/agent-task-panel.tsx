"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useChatbot } from "@/contexts/chatbot-context";
import { 
  Package, GitBranch, BarChart3, Download, FileText, ArrowLeft 
} from "lucide-react";
import { AgentItemCreator } from "./agent-item-creator";
import { AgentWorkflowVisualizer } from "./agent-workflow-visualizer";
import { AgentItemAnalysis } from "./agent-item-analysis";

export function AgentTaskPanel() {
  const router = useRouter();
  const { setChatOpen, setMessages } = useChatbot();
  const [activeWorkflow, setActiveWorkflow] = useState<
    "create_item" | "document_workflow" | "item_analysis" | "data_export" | "report_generation" | null
  >(null);

  if (activeWorkflow === "create_item") {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center">
          <button
            onClick={() => setActiveWorkflow(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Guided Tasks
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <AgentItemCreator />
        </div>
      </div>
    );
  }

  if (activeWorkflow === "document_workflow") {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center">
          <button
            onClick={() => setActiveWorkflow(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Guided Tasks
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <AgentWorkflowVisualizer />
        </div>
      </div>
    );
  }

  if (activeWorkflow === "item_analysis") {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center">
          <button
            onClick={() => setActiveWorkflow(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Guided Tasks
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AgentItemAnalysis />
        </div>
      </div>
    );
  }

  if (activeWorkflow === "data_export") {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center">
          <button
            onClick={() => setActiveWorkflow(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Guided Tasks
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center bg-slate-50/20">
          <div className="max-w-md space-y-3">
            <Download className="h-10 w-10 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Export / Import Mapper Assistant</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              AI-assisted spreadsheet importer. Clean column values, map layout tables, and bulk import records under transaction safety bounds. This utility is scheduled for complete release in the next update.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (activeWorkflow === "report_generation") {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center">
          <button
            onClick={() => setActiveWorkflow(null)}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Guided Tasks
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center bg-slate-50/20">
          <div className="max-w-md space-y-3">
            <FileText className="h-10 w-10 text-slate-400 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">AI Financial Report Generator</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Instantly draft comparative balance sheets, cashflow reports, and operational dashboards from live ledger postings. This tool is scheduled for release in the next update.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 bg-slate-50/30">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-800">Guided Agentic Tasks</h2>
          <p className="text-xs text-slate-500 mt-1">Select an automated task flow below. Nemo will guide you step-by-step.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              id: "create_item" as const,
              title: "Create Item with AI",
              desc: "AI will ask you questions and automatically fill in the accounting item form.",
              icon: Package,
              color: "text-teal-600 bg-teal-50 border-teal-100",
              btnText: "Start",
            },
            {
              id: "document_workflow" as const,
              title: "Document Automation",
              desc: "Automatically chain Sales Order → Invoice → Payment with AI.",
              icon: GitBranch,
              color: "text-purple-600 bg-purple-50 border-purple-100",
              btnText: "Start",
            },
            {
              id: "item_analysis" as const,
              title: "Analyze Items",
              desc: "AI reads your inventory and provides actionable business insights.",
              icon: BarChart3,
              color: "text-emerald-600 bg-emerald-50 border-emerald-100",
              btnText: "Analyze",
            },
            {
              id: "data_export" as const,
              title: "Export with AI",
              desc: "AI helps you map sheets, export the right records, and format excel data.",
              icon: Download,
              color: "text-amber-600 bg-amber-50 border-amber-100",
              btnText: "Start",
            },
            {
              id: "report_generation" as const,
              title: "Generate Report",
              desc: "Ask AI to compile and generate custom financial statements from live logs.",
              icon: FileText,
              color: "text-blue-600 bg-blue-50 border-blue-100",
              btnText: "Generate",
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className="rounded-2xl border border-slate-250 bg-white p-5 flex flex-col justify-between hover:border-slate-350 hover:shadow-xs transition-all duration-200"
              >
                <div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border mb-4 ${card.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">{card.title}</h3>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{card.desc}</p>
                </div>
                <div className="mt-6 flex items-center justify-end border-t border-slate-100 pt-3">
                  <button
                    onClick={() => {
                      if (card.id === "create_item") {
                        setChatOpen(true);
                        router.push("/items/new");
                        setMessages((prev) => [
                          ...prev,
                          {
                            role: "assistant",
                            content: "👋 I'm ready to help you create a new item! Please describe what you want to create (e.g. *'Create a goods item named Organic Matcha Green Tea with SKU MATCHA-101 and selling price 850'*) and I will type it directly into your form below.",
                            timestamp: Date.now(),
                          },
                        ]);
                      } else {
                        setActiveWorkflow(card.id);
                      }
                    }}
                    className="rounded-lg bg-teal-600 px-4.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition-colors cursor-pointer"
                  >
                    {card.btnText}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
