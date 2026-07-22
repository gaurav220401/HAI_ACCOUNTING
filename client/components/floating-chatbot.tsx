"use client";

import * as React from "react";
import { useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ChatbotPanel } from "@/components/chatbot-panel";

export function FloatingChatbot() {
  const { firebaseUser, loading } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Do not render if auth is loading or user is not logged in
  if (loading || !firebaseUser) {
    return null;
  }

  return (
    <>
      {/* Only show the floating action button and greeting tooltip if the chat panel is NOT open */}
      {!chatOpen && (
        <div
          className="fixed bottom-6 right-6 z-[999] flex flex-col items-center"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* ── Hover Greeting Bubble (Speech Bubble) ── */}
          <div
            className={`absolute bottom-20 right-0 w-64 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl shadow-slate-200/50 transition-all duration-300 transform origin-bottom-right ${
              isHovered
                ? "scale-100 opacity-100 translate-y-0 visible"
                : "scale-95 opacity-0 translate-y-2 invisible pointer-events-none"
            }`}
          >
            {/* Speech Bubble Arrow */}
            <div className="absolute -bottom-2 right-6 h-4 w-4 rotate-45 border-r border-b border-slate-100 bg-white" />

            <div className="relative">
              <p className="text-[13px] font-bold text-teal-700 flex items-center gap-1.5">
                <span>👋</span> Hi, I'm Nemo
              </p>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                Ask anything, or tell me where you need to go. I can navigate you to pages, explain features, and more!
              </p>
            </div>
          </div>

          {/* ── Main Chatbot Button Group ── */}
          <div className="relative flex flex-col items-center">
            {/* Main Floating Action Button */}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/35 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer relative overflow-hidden group"
              title="Nemo Chatbot"
            >
              {/* Glowing inner border effect */}
              <div className="absolute inset-0 rounded-full border border-white/20 group-hover:scale-105 transition-transform duration-300" />
              
              {/* Soft pulse effect */}
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
              
              <Bot className="h-6 w-6 transform group-hover:rotate-6 transition-transform duration-300" />
              <Sparkles className="absolute top-3.5 right-3.5 h-2.5 w-2.5 text-yellow-300 animate-pulse" />
            </button>

            {/* Label Pill Below Button */}
            <div className="mt-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-700 tracking-wide uppercase whitespace-nowrap">
                Ask Nemo
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Chatbot Panel ── */}
      <ChatbotPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
