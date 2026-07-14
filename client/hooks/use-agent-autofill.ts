"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface AgentAutofillPayload {
  formType: "invoice" | "bill" | "customer" | "vendor" | "item" | "expense";
  data: Record<string, any>;
  navigationUrl?: string;
  autoOpenModal?: boolean;
}

const AGENT_AUTOFILL_EVENT = "hai:agent-autofill";

/**
 * Dispatch an auto-fill event from the AI Agent UI panel.
 */
export function dispatchAgentAutofill(payload: AgentAutofillPayload) {
  if (typeof window !== "undefined") {
    const event = new CustomEvent(AGENT_AUTOFILL_EVENT, { detail: payload });
    window.dispatchEvent(event);
  }
}

/**
 * React hook to listen for AI Agent form pre-fill events on target form pages/modals.
 */
export function useAgentAutofill(targetFormType: AgentAutofillPayload["formType"]) {
  const [autofillData, setAutofillData] = useState<Record<string, any> | null>(null);
  const [isAutofilled, setIsAutofilled] = useState(false);
  const router = useRouter();

  const handleAutofillEvent = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<AgentAutofillPayload>;
    const { formType, data, navigationUrl } = customEvent.detail;

    if (formType === targetFormType) {
      setAutofillData(data);
      setIsAutofilled(true);

      if (navigationUrl && typeof window !== "undefined" && window.location.pathname !== navigationUrl) {
        router.push(navigationUrl);
      }
    }
  }, [targetFormType, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.addEventListener(AGENT_AUTOFILL_EVENT, handleAutofillEvent);
    return () => {
      window.removeEventListener(AGENT_AUTOFILL_EVENT, handleAutofillEvent);
    };
  }, [handleAutofillEvent]);

  const clearAutofill = useCallback(() => {
    setAutofillData(null);
    setIsAutofilled(false);
  }, []);

  return { autofillData, isAutofilled, clearAutofill };
}
