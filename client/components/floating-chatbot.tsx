"use client";

import * as React from "react";
import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { ChatbotPanel } from "@/components/chatbot-panel";
import { FloatingAIButton } from "@/components/floating-ai-button";
import { usePathname } from "next/navigation";

export function FloatingChatbot() {
  const { firebaseUser, loading } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);
  const pathname = usePathname();

  // Hide floating chatbot on the AI Agent dashboard page
  if (pathname === "/ai-agent") {
    return null;
  }

  // Do not render if auth is loading or user is not logged in
  if (loading || !firebaseUser) {
    return null;
  }

  return (
    <>
      <FloatingAIButton
        isOpen={chatOpen}
        onToggle={() => setChatOpen((prev) => !prev)}
      />
      <ChatbotPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}

