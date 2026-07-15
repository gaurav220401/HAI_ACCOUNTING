"use client";

import React, { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  Play,
  Pause,
  X,
  Sparkles,
  Navigation,
  Brain,
  Pencil,
  ArrowDown,
  MousePointer,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DRIVER_STATE_EVENT,
  VisualAgentDriverController,
  resumePendingDriverSession,
  type DriverState,
  type DriverStep,
  type DriverStepStatus,
} from "@/hooks/visual-agent-driver";
import { dispatchAgentAutofill } from "@/hooks/use-agent-autofill";

// ─── Step Icon Resolver ────────────────────────────────────────────────

function StepIcon({ type, status }: { type: DriverStep["type"]; status: DriverStepStatus }) {
  const size = "h-3.5 w-3.5";

  if (status === "done") return <CheckCircle2 className={`${size} text-emerald-400`} />;
  if (status === "failed") return <XCircle className={`${size} text-red-400`} />;
  if (status === "skipped") return <SkipForward className={`${size} text-slate-500`} />;

  if (status === "active") {
    return <Loader2 className={`${size} text-teal-400 animate-spin`} />;
  }

  // Pending — show type icon
  switch (type) {
    case "think":
      return <Brain className={`${size} text-purple-400`} />;
    case "navigate":
      return <Navigation className={`${size} text-blue-400`} />;
    case "fill_field":
      return <Pencil className={`${size} text-amber-400`} />;
    case "scroll_to":
      return <ArrowDown className={`${size} text-cyan-400`} />;
    case "click":
      return <MousePointer className={`${size} text-pink-400`} />;
    case "wait":
      return <Clock className={`${size} text-slate-400`} />;
    case "complete":
      return <Sparkles className={`${size} text-yellow-400`} />;
    default:
      return <Bot className={`${size} text-slate-400`} />;
  }
}

// ─── Step Row ──────────────────────────────────────────────────────────

function StepRow({ step, isLast }: { step: DriverStep; isLast: boolean }) {
  const isActive = step.status === "active";
  const isDone = step.status === "done";
  const isFailed = step.status === "failed";
  const isPending = step.status === "pending";

  return (
    <div className="flex items-start gap-2.5 relative">
      {/* Timeline connector line */}
      {!isLast && (
        <div
          className={`absolute left-[11px] top-[22px] w-[2px] h-[calc(100%+2px)] ${
            isDone ? "bg-emerald-500/40" : isActive ? "bg-teal-500/40" : "bg-slate-700/40"
          }`}
        />
      )}

      {/* Step icon circle */}
      <div
        className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          isActive
            ? "border-teal-500/60 bg-teal-500/20 shadow-[0_0_12px_rgba(20,184,166,0.4)]"
            : isDone
            ? "border-emerald-500/40 bg-emerald-500/15"
            : isFailed
            ? "border-red-500/40 bg-red-500/15"
            : "border-slate-600/40 bg-slate-800/40"
        }`}
      >
        <StepIcon type={step.type} status={step.status} />
      </div>

      {/* Step label */}
      <div className="flex-1 min-w-0 pt-0.5 pb-2">
        <span
          className={`text-[11px] leading-tight font-medium block ${
            isActive
              ? "text-teal-300"
              : isDone
              ? "text-emerald-400/80"
              : isFailed
              ? "text-red-400"
              : isPending
              ? "text-slate-500"
              : "text-slate-500"
          }`}
        >
          {step.label}
        </span>
        {step.value && isActive && (
          <span className="text-[10px] text-teal-400/60 font-mono truncate block mt-0.5">
            → "{step.value}"
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Elapsed Timer ─────────────────────────────────────────────────────

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="text-[10px] font-mono text-slate-400 tabular-nums">
      {mins > 0 ? `${mins}m ` : ""}{secs}s
    </span>
  );
}

// ─── Main Overlay Component ────────────────────────────────────────────

export function VisualAgentOverlay() {
  const pathname = usePathname();
  const [driverState, setDriverState] = useState<DriverState | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleDriverState = (event: Event) => {
      const customEvent = event as CustomEvent<DriverState>;
      setDriverState(customEvent.detail);

      // Auto-expand when driver becomes active
      if (customEvent.detail.active) {
        setIsExpanded(true);
      }
    };

    window.addEventListener(DRIVER_STATE_EVENT, handleDriverState);

    // ── Check if there is a pending visual session stored from cross-page navigation ──
    const pending = resumePendingDriverSession();
    if (pending && pending.steps && pending.steps.length > 0) {
      // Re-hydrate full steps (completed + remaining) for a continuous timeline
      const fullSteps = [
        ...(pending.completedSteps || []),
        ...pending.steps,
      ];

      const driver = new VisualAgentDriverController({
        steps: fullSteps,
        formType: pending.formType,
        navigationUrl: pending.navigationUrl,
        formData: pending.formData,
        onNavigate: (url) => {
          if (window.location.pathname !== url) {
            window.location.href = url;
          }
        },
        onFillField: (fieldKey, value) => {
          if (pending.formType) {
            dispatchAgentAutofill({
              formType: pending.formType as any,
              data: pending.formData || {},
              executionMode: "visual_ui",
            });
          }
        },
      });

      // Execute driver after short delay to let DOM hydrate
      setTimeout(() => {
        driver.run();
      }, 400);
    }

    return () => {
      window.removeEventListener(DRIVER_STATE_EVENT, handleDriverState);
    };
  }, [pathname]);

  const handlePauseResume = useCallback(() => {
    if (!driverState) return;
    // Dispatch a control event that the driver listens for
    window.dispatchEvent(
      new CustomEvent("hai:visual-driver-control", {
        detail: { action: driverState.isPaused ? "resume" : "pause" },
      })
    );
  }, [driverState]);

  const handleCancel = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("hai:visual-driver-control", {
        detail: { action: "cancel" },
      })
    );
  }, []);

  if (!driverState?.active) return null;

  const { steps, currentStepIndex, isPaused, startedAt, formType } = driverState;
  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalCount = steps.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;
  const isComplete = steps.every((s) => s.status === "done" || s.status === "skipped" || s.status === "failed");

  return (
    <div className="fixed top-4 left-1/2 z-[9999] -translate-x-1/2 transform w-[420px] max-w-[95vw]">
      {/* Main Container */}
      <div
        className="rounded-2xl border border-teal-500/30 bg-slate-950/95 shadow-2xl backdrop-blur-xl overflow-hidden"
        style={{
          boxShadow: "0 0 40px rgba(20, 184, 166, 0.15), 0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* ── Header Bar ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/80">
          {/* Animated Bot Icon */}
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600/30 to-cyan-600/20 text-teal-400">
            <Bot className={`h-4.5 w-4.5 ${isComplete ? "" : "animate-bounce"}`} />
            {!isComplete && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
              </span>
            )}
          </div>

          {/* Title + Current Step */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {isComplete ? "Agent Complete" : isPaused ? "Agent Paused" : "Live UI Agent"}
              </span>
              {formType && (
                <span className="text-[9px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded font-medium uppercase">
                  {formType}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 truncate mt-0.5 font-medium">
              {currentStep?.label || (isComplete ? "All steps completed!" : "Initializing...")}
            </p>
          </div>

          {/* Timer + Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <ElapsedTimer startedAt={startedAt} />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>

            {!isComplete && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePauseResume}
                  className="h-7 w-7 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancel}
                  className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg"
                  title="Stop Agent"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Progress Bar ── */}
        <div className="h-1 w-full bg-slate-800/60">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              isComplete ? "bg-emerald-500" : "bg-gradient-to-r from-teal-500 to-cyan-400"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* ── Step Timeline (Expandable) ── */}
        {isExpanded && (
          <div className="px-4 py-3 max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                Execution Steps
              </span>
              <span className="text-[10px] font-medium text-slate-500">
                {completedCount}/{totalCount}
              </span>
            </div>

            <div className="space-y-0">
              {steps.map((step, idx) => (
                <StepRow key={step.id} step={step} isLast={idx === steps.length - 1} />
              ))}
            </div>
          </div>
        )}

        {/* ── Compact progress counter when collapsed ── */}
        {!isExpanded && (
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-medium">
              Step {Math.min(currentStepIndex + 1, totalCount)} of {totalCount}
            </span>
            <span className="text-[10px] text-teal-400 font-bold">{progressPct}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
