"use client";

/**
 * Visual Agent Driver — Orchestrates step-by-step visual execution of AI agent plans.
 *
 * This is the core engine that makes the Live UI Agent work like Antigravity/Claude Code:
 * - Executes steps sequentially with visual feedback
 * - Navigates pages via Next.js router (no full reload)
 * - Fills form fields via the autofill hook (React state-based)
 * - Highlights active elements with glowing rings
 * - Reports progress to the VisualAgentOverlay
 */

import type { AgentExecutionStep } from "@/lib/api/agent";

// ─── Driver State ──────────────────────────────────────────────────────

export type DriverStepStatus = "pending" | "active" | "done" | "failed" | "skipped";

export interface DriverStep extends AgentExecutionStep {
  status: DriverStepStatus;
  startedAt?: number;
  completedAt?: number;
}

export interface DriverState {
  active: boolean;
  steps: DriverStep[];
  currentStepIndex: number;
  isPaused: boolean;
  isCancelled: boolean;
  startedAt: number;
  formType?: string;
  navigationUrl?: string;
  formData?: Record<string, any>;
}

// ─── Event Names ───────────────────────────────────────────────────────

export const DRIVER_STATE_EVENT = "hai:visual-driver-state";
export const DRIVER_NAVIGATE_EVENT = "hai:visual-driver-navigate";
export const DRIVER_FILL_EVENT = "hai:visual-driver-fill";

// ─── Dispatch driver state to overlay ──────────────────────────────────

export function dispatchDriverState(state: DriverState) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DRIVER_STATE_EVENT, { detail: state }));
  }
}

// ─── Highlight Element ─────────────────────────────────────────────────

const HIGHLIGHT_CLASSES = [
  "hai-agent-highlight",
];

let currentHighlight: HTMLElement | null = null;

function highlightElement(el: HTMLElement | null) {
  // Remove previous highlight
  if (currentHighlight) {
    currentHighlight.classList.remove(...HIGHLIGHT_CLASSES);
    currentHighlight.style.removeProperty("box-shadow");
    currentHighlight.style.removeProperty("transition");
  }

  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(...HIGHLIGHT_CLASSES);
    el.style.transition = "box-shadow 0.3s ease, outline 0.3s ease";
    el.style.boxShadow = "0 0 0 3px rgba(20, 184, 166, 0.5), 0 0 20px rgba(20, 184, 166, 0.25)";
    currentHighlight = el;
  } else {
    currentHighlight = null;
  }
}

function clearHighlight() {
  highlightElement(null);
}

// ─── Set React-controlled input value ──────────────────────────────────

function setReactInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // Use the native setter to bypass React's synthetic event system
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value"
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  // Dispatch events that React listens for
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

// ─── Simulate visual typing with character-by-character effect ─────────

async function simulateVisualType(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  onChar?: (partial: string) => void
): Promise<void> {
  element.focus();
  highlightElement(element);

  let current = "";
  const charDelay = Math.max(15, Math.min(40, 800 / value.length)); // adaptive speed

  for (let i = 0; i < value.length; i++) {
    current += value[i];
    setReactInputValue(element, current);
    if (onChar) onChar(current);
    await sleep(charDelay);
  }

  // Final change event
  element.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(100);
}

// ─── Find form field element ───────────────────────────────────────────

function findFieldElement(fieldKey: string): HTMLElement | null {
  if (!fieldKey) return null;
  const keyLower = fieldKey.toLowerCase();

  // 1. Direct attribute match
  const directMatch =
    document.querySelector<HTMLElement>(`[data-agent-field="${fieldKey}"]`) ||
    document.querySelector<HTMLElement>(`[name="${fieldKey}"]`) ||
    document.querySelector<HTMLElement>(`#${fieldKey}`) ||
    document.querySelector<HTMLElement>(`[data-field="${fieldKey}"]`);
  if (directMatch) return directMatch;

  // 2. Search inputs/textareas by placeholder or field key matching
  const inputs = Array.from(document.querySelectorAll<HTMLElement>("input, textarea, select"));
  for (const input of inputs) {
    const placeholder = (input.getAttribute("placeholder") || "").toLowerCase();
    const id = (input.getAttribute("id") || "").toLowerCase();
    const name = (input.getAttribute("name") || "").toLowerCase();
    const type = (input.getAttribute("type") || "").toLowerCase();

    if (type === "hidden" || type === "file") continue;

    if (
      id.includes(keyLower) ||
      name.includes(keyLower) ||
      placeholder.includes(keyLower)
    ) {
      return input;
    }

    // Specific field alias matching
    if (
      (keyLower.includes("email") && (placeholder.includes("email") || type === "email")) ||
      (keyLower.includes("first") && placeholder.includes("first")) ||
      (keyLower.includes("last") && placeholder.includes("last")) ||
      (keyLower.includes("company") && placeholder.includes("company")) ||
      (keyLower.includes("display") && placeholder.includes("display")) ||
      (keyLower.includes("phone") && (placeholder.includes("phone") || placeholder.includes("work"))) ||
      (keyLower.includes("mobile") && placeholder.includes("mobile")) ||
      (keyLower.includes("gst") && placeholder.includes("gst")) ||
      (keyLower.includes("amount") && placeholder.includes("amount"))
    ) {
      return input;
    }
  }

  return null;
}

// ─── Sleep utility ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Execute the Visual Agent Driver ───────────────────────────────────

export interface DriverOptions {
  steps: AgentExecutionStep[];
  formType?: string;
  navigationUrl?: string;
  formData?: Record<string, any>;
  onNavigate?: (url: string) => void;
  onFillField?: (fieldKey: string, value: string) => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

export class VisualAgentDriverController {
  private state: DriverState;
  private options: DriverOptions;
  private abortController: AbortController;
  private pausePromiseResolve: (() => void) | null = null;

  constructor(options: DriverOptions) {
    this.options = options;
    this.abortController = new AbortController();

    this.state = {
      active: true,
      steps: options.steps.map((s) => ({ ...s, status: "pending" as DriverStepStatus })),
      currentStepIndex: -1,
      isPaused: false,
      isCancelled: false,
      startedAt: Date.now(),
      formType: options.formType,
      navigationUrl: options.navigationUrl,
      formData: options.formData,
    };
  }

  private emit() {
    dispatchDriverState({ ...this.state, steps: [...this.state.steps] });
  }

  pause() {
    this.state.isPaused = true;
    this.emit();
  }

  resume() {
    this.state.isPaused = false;
    if (this.pausePromiseResolve) {
      this.pausePromiseResolve();
      this.pausePromiseResolve = null;
    }
    this.emit();
  }

  cancel() {
    this.state.isCancelled = true;
    this.state.active = false;
    this.abortController.abort();
    clearHighlight();

    // Mark remaining steps as skipped
    for (let i = this.state.currentStepIndex + 1; i < this.state.steps.length; i++) {
      this.state.steps[i].status = "skipped";
    }

    this.emit();
    this.options.onCancel?.();
  }

  private async waitIfPaused(): Promise<void> {
    if (!this.state.isPaused) return;
    return new Promise<void>((resolve) => {
      this.pausePromiseResolve = resolve;
    });
  }

  async run(): Promise<void> {
    this.emit();

    for (let i = 0; i < this.state.steps.length; i++) {
      if (this.state.isCancelled) break;
      await this.waitIfPaused();
      if (this.state.isCancelled) break;

      this.state.currentStepIndex = i;
      this.state.steps[i].status = "active";
      this.state.steps[i].startedAt = Date.now();
      this.emit();

      try {
        const res = await this.executeStep(this.state.steps[i]);
        if (res === "navigated") {
          // Execution handed off to target page via sessionStorage — stop running on this unmounting page
          return;
        }
        this.state.steps[i].status = "done";
        this.state.steps[i].completedAt = Date.now();
      } catch (err) {
        this.state.steps[i].status = "failed";
        this.state.steps[i].completedAt = Date.now();
        console.error(`[VisualAgentDriver] Step failed:`, err);
      }

      this.emit();
    }

    // Final cleanup
    clearHighlight();

    if (!this.state.isCancelled) {
      // Keep the overlay visible for a few seconds to show completion
      await sleep(3000);
      this.state.active = false;
      this.emit();
      this.options.onComplete?.();
    }
  }

  private async executeStep(step: DriverStep): Promise<void | "navigated"> {
    const stepDelay = step.delay || 500;

    switch (step.type) {
      case "think":
        await sleep(stepDelay);
        break;

      case "navigate": {
        if (step.target && typeof window !== "undefined") {
          const currentPath = window.location.pathname;
          if (currentPath !== step.target) {
            // Store remaining steps + form data in sessionStorage for cross-page persistence
            const remainingSteps = this.state.steps.slice(this.state.currentStepIndex + 1);
            const pendingPayload = {
              steps: remainingSteps,
              formType: this.state.formType,
              navigationUrl: this.state.navigationUrl,
              formData: this.state.formData,
              startedAt: this.state.startedAt,
              completedSteps: this.state.steps.slice(0, this.state.currentStepIndex + 1),
            };
            try {
              sessionStorage.setItem("hai_visual_driver_pending", JSON.stringify(pendingPayload));
            } catch (e) {}

            // Mark this navigation step as completed before transition
            step.status = "done";
            step.completedAt = Date.now();
            this.emit();

            // Trigger navigation callback
            this.options.onNavigate?.(step.target);

            // Signal to halt execution loop on current page
            return "navigated";
          }
        }
        await sleep(stepDelay);
        break;
      }

      case "wait":
        await sleep(stepDelay);
        break;

      case "fill_field": {
        const fieldKey = step.fieldKey || step.target || "";
        const value = step.value || "";

        if (!fieldKey || !value) {
          await sleep(200);
          break;
        }

        // Always trigger state update via onFillField
        this.options.onFillField?.(fieldKey, value);

        // Try to locate DOM element with up to 3 retries (to allow react hydration after page load)
        let el: HTMLElement | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          el = findFieldElement(fieldKey);
          if (el) break;
          await sleep(250);
        }

        if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          await simulateVisualType(el, value);
        } else {
          await sleep(300);
        }

        await sleep(stepDelay);
        break;
      }

      case "scroll_to": {
        if (step.target === "top") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (step.target) {
          const el = document.querySelector<HTMLElement>(step.target);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            highlightElement(el);
          }
        }
        await sleep(stepDelay);
        break;
      }

      case "click": {
        if (step.target) {
          const el = document.querySelector<HTMLElement>(step.target);
          if (el) {
            highlightElement(el);
            await sleep(300);
            el.click();
          }
        }
        await sleep(stepDelay);
        break;
      }

      case "complete":
        clearHighlight();
        await sleep(stepDelay);
        break;

      default:
        await sleep(stepDelay);
    }
  }
}

/**
 * Resume a driver session from sessionStorage after cross-page navigation.
 * Returns null if no pending session exists.
 */
export function resumePendingDriverSession(): {
  steps: AgentExecutionStep[];
  formType?: string;
  navigationUrl?: string;
  formData?: Record<string, any>;
  startedAt: number;
  completedSteps: DriverStep[];
} | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem("hai_visual_driver_pending");
    if (!raw) return null;

    sessionStorage.removeItem("hai_visual_driver_pending");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
