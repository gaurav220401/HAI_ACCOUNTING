"use client";

import * as React from "react";
import { useState } from "react";
import { Wand2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { AIAgentPanel } from "@/components/ai-agent-panel";

export function FloatingAgentLauncher() {
  const { firebaseUser, loading } = useAuth();
  const [agentOpen, setAgentOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  if (loading || !firebaseUser) {
    return null;
  }

  return (
    <>
      {!agentOpen && (
        <div
          className="fixed bottom-6 right-24 z-[998] flex flex-col items-center"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Hover Greeting Bubble */}
          <div
            className={`absolute bottom-20 right-0 w-64 rounded-2xl border border-purple-100 bg-white p-4 shadow-xl shadow-purple-500/10 transition-all duration-300 transform origin-bottom-right ${
              isHovered
                ? "scale-100 opacity-100 translate-y-0 visible"
                : "scale-95 opacity-0 translate-y-2 invisible pointer-events-none"
            }`}
          >
            <div className="absolute -bottom-2 right-6 h-4 w-4 rotate-45 border-r border-b border-purple-100 bg-white" />
            <div className="relative">
              <p className="text-[13px] font-bold text-purple-700 flex items-center gap-1.5">
                <span>⚡</span> AI Task Agent
              </p>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                Give natural language commands. I can create invoices, update customers, log expenses & auto-fill forms!
              </p>
            </div>
          </div>

          {/* Main Floating Action Button */}
          <div className="relative flex flex-col items-center">
            <button
              type="button"
              onClick={() => setAgentOpen(true)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 text-white shadow-lg shadow-purple-600/30 hover:shadow-xl hover:shadow-purple-600/40 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer relative overflow-hidden group"
              title="AI Task Agent"
            >
              <div className="absolute inset-0 rounded-full border border-white/25 group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
              <Wand2 className="h-6 w-6 text-purple-100 transform group-hover:-rotate-12 transition-transform duration-300" />
              <Sparkles className="absolute top-3 right-3 h-3 w-3 text-yellow-300 animate-pulse" />
            </button>

            {/* Label Pill Below Button */}
            <div className="mt-2 rounded-full border border-purple-200/80 bg-white px-3 py-1 shadow-2xs">
              <span className="text-[10px] font-extrabold text-purple-800 tracking-wide uppercase whitespace-nowrap flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                AI Task Agent
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out AI Agent Panel */}
      <AIAgentPanel isOpen={agentOpen} onClose={() => setAgentOpen(false)} />
    </>
  );
}
