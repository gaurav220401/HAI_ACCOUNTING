"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface AgentAutofillPayload {
  formType: "invoice" | "bill" | "customer" | "vendor" | "item" | "expense";
  data: Record<string, any>;
  navigationUrl?: string;
  autoOpenModal?: boolean;
  executionMode?: "api" | "visual_ui";
  autoSubmit?: boolean;
}

const AGENT_AUTOFILL_EVENT = "hai:agent-autofill";

/**
 * Dispatch an auto-fill event from the AI Agent UI panel.
 * Used for Direct API mode (non-visual) autofill.
 */
export function dispatchAgentAutofill(payload: AgentAutofillPayload) {
  if (typeof window !== "undefined") {
    const event = new CustomEvent(AGENT_AUTOFILL_EVENT, { detail: payload });
    window.dispatchEvent(event);
  }
}

/**
 * Set a React-controlled input value properly using the native prototype setter.
 * This is the key fix — React ignores direct .value assignments.
 */
function setReactInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;

  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Simulate live visual highlighting and typing into a DOM element.
 * Now works with React-controlled inputs.
 */
export async function simulateVisualTyping(
  element: HTMLElement | null,
  value: string,
  onProgress?: (typed: string) => void
): Promise<void> {
  if (!element) return;

  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus();

  // Add glowing visual highlight ring
  element.style.transition = "box-shadow 0.3s ease";
  element.style.boxShadow = "0 0 0 3px rgba(20, 184, 166, 0.5), 0 0 20px rgba(20, 184, 166, 0.25)";

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    let current = "";
    const charDelay = Math.max(15, Math.min(40, 800 / value.length));

    for (let i = 0; i < value.length; i++) {
      current += value[i];
      setReactInputValue(element, current);
      if (onProgress) onProgress(current);
      await new Promise((resolve) => setTimeout(resolve, charDelay));
    }

    // Final change event
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  await new Promise((resolve) => setTimeout(resolve, 150));
  element.style.boxShadow = "";
}

/**
 * React hook to listen for AI Agent form pre-fill events on target form pages/modals.
 * This hook applies the autofill data via React state (not DOM manipulation).
 */
export function useAgentAutofill(targetFormType: AgentAutofillPayload["formType"]) {
  const [autofillData, setAutofillData] = useState<Record<string, any> | null>(null);
  const [isAutofilled, setIsAutofilled] = useState(false);
  const [isVisualDriving, setIsVisualDriving] = useState(false);
  const router = useRouter();

  const handleAutofillEvent = useCallback(
    async (event: Event) => {
      const customEvent = event as CustomEvent<AgentAutofillPayload>;
      const { formType, data, navigationUrl, executionMode } = customEvent.detail;

      if (formType !== targetFormType) return;

      // Navigate if needed
      if (navigationUrl && typeof window !== "undefined" && window.location.pathname !== navigationUrl) {
        router.push(navigationUrl);
        await new Promise((res) => setTimeout(res, 500));
      }

      // Apply the data via React state
      setAutofillData(data);
      setIsAutofilled(true);
    },
    [targetFormType, router]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if there's a pending autofill stored from cross-page navigation
    try {
      const raw = sessionStorage.getItem("hai_pending_autofill");
      if (raw) {
        const payload: AgentAutofillPayload = JSON.parse(raw);
        if (payload.formType === targetFormType) {
          sessionStorage.removeItem("hai_pending_autofill");
          setTimeout(() => {
            handleAutofillEvent(new CustomEvent(AGENT_AUTOFILL_EVENT, { detail: payload }));
          }, 300);
        }
      }
    } catch (e) {}

    window.addEventListener(AGENT_AUTOFILL_EVENT, handleAutofillEvent);
    return () => {
      window.removeEventListener(AGENT_AUTOFILL_EVENT, handleAutofillEvent);
    };
  }, [handleAutofillEvent, targetFormType]);

  const clearAutofill = useCallback(() => {
    setAutofillData(null);
    setIsAutofilled(false);
  }, []);

  return { autofillData, isAutofilled, isVisualDriving, clearAutofill };
}
