"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Bot, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingAIButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  isProcessing?: boolean;
}

export function FloatingAIButton({
  isOpen,
  onToggle,
  isProcessing = false,
}: FloatingAIButtonProps) {
  const [mounted, setMounted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 transition-all duration-500 ease-out transform",
        mounted ? "scale-100 opacity-100 translate-y-0" : "scale-50 opacity-0 translate-y-4"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Tooltip / Label */}
      <div
        className={cn(
          "absolute bottom-full right-0 mb-3 px-3 py-1.5 rounded-xl border border-slate-100 bg-white shadow-xl shadow-slate-200/50 transition-all duration-300 transform origin-bottom-right whitespace-nowrap pointer-events-none select-none",
          isHovered && !isOpen
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-95 opacity-0 translate-y-2"
        )}
      >
        {/* Little triangle arrow */}
        <div className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-r border-b border-slate-100 bg-white" />
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-teal-600 animate-pulse" />
          <span className="text-[11px] font-bold text-slate-700">HAI AI Assistant</span>
        </div>
      </div>

      {/* Button wrapper for spinning ring when processing */}
      <div className="relative flex items-center justify-center">
        {isProcessing && (
          <span className="absolute inset-[-4px] rounded-full border-2 border-teal-500/30 border-t-teal-600 animate-spin" />
        )}

        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-lg transition-all duration-300 cursor-pointer relative overflow-hidden group focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:ring-offset-2",
            isOpen
              ? "from-slate-700 to-slate-800 shadow-slate-800/25 hover:shadow-xl hover:shadow-slate-800/35 hover:scale-105 active:scale-95"
              : "from-teal-600 to-teal-700 shadow-teal-600/25 hover:shadow-xl hover:shadow-teal-600/35 hover:scale-105 active:scale-95"
          )}
          title={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
        >
          {/* Inner ring */}
          <div className="absolute inset-0 rounded-full border border-white/10 group-hover:scale-105 transition-transform duration-300" />
          {/* Shine effect */}
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />

          {isOpen ? (
            <X className="h-6 w-6 transform rotate-0 hover:rotate-95 transition-transform duration-300" />
          ) : (
            <>
              <Bot className="h-6 w-6 transform group-hover:rotate-6 transition-transform duration-300" />
              {/* Pulsing Sparkles badge */}
              <span className="absolute top-3.5 right-3.5 h-2.5 w-2.5 flex items-center justify-center">
                <Sparkles className="h-2.5 w-2.5 text-yellow-300 animate-pulse" />
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
