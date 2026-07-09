"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, MessageSquare, Send, Sparkles, X, ArrowUpRight, AlertCircle, RefreshCw } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendChatMessage, type ChatMessage } from "@/lib/api/chatbot";
import { cn } from "@/lib/utils";

// ─── Suggested Starter Questions ───────────────────────────────────────

const STARTER_QUESTIONS = [
  "How do I create a new invoice?",
  "What is the purchase order workflow?",
  "How do recurring invoices work?",
  "How do I manage vendor credits?",
];

// ─── Typing Indicator ──────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 shadow-sm">
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-100 bg-slate-50 px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────

function MessageBubble({
  message,
  onSourceClick,
}: {
  message: ChatMessage;
  onSourceClick?: (title: string) => void;
}) {
  const isUser = message.role === "user";

  if (message.isError) {
    return (
      <div className="px-4 py-1.5">
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <p className="text-xs leading-relaxed text-rose-700">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2.5 px-4 py-1.5", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 shadow-sm">
          <Bot className="h-3.5 w-3.5 text-white" />
        </div>
      )}

      <div className={cn("max-w-[85%] space-y-1.5", isUser && "flex flex-col items-end")}>
        {/* Bubble */}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
            isUser
              ? "rounded-br-md bg-teal-600 text-white shadow-sm"
              : "rounded-bl-md border border-slate-100 bg-slate-50 text-slate-800"
          )}
        >
          {/* Render markdown-like content for bot messages */}
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose-chatbot prose prose-sm max-w-none">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  strong: ({node, ...props}) => <strong className="font-bold text-teal-900" {...props} />,
                  em: ({node, ...props}) => <em className="italic text-teal-800" {...props} />,
                  h1: ({node, ...props}) => <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />,
                  h2: ({node, ...props}) => <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 my-1" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal pl-4 space-y-1 my-1" {...props} />,
                  li: ({node, ...props}) => <li className="text-slate-700 marker:text-teal-500" {...props} />,
                  a: ({node, ...props}) => <a className="text-teal-600 underline hover:text-teal-800" {...props} />,
                  p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Source chips */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-0.5">
            {message.sources.map((source, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSourceClick?.(source.title)}
                className="inline-flex items-center gap-1 rounded-full border border-teal-100 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 transition-colors hover:bg-teal-100 hover:border-teal-200 cursor-pointer"
              >
                <ArrowUpRight className="h-2.5 w-2.5" />
                {source.title}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className={cn("text-[10px] text-slate-400 px-1", isUser && "text-right")}>
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

// ─── Format Helpers ────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Welcome / Empty State ─────────────────────────────────────────────

function WelcomeState({ onQuestionClick }: { onQuestionClick: (q: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-lg shadow-teal-500/20">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h3 className="mb-1 text-base font-bold text-slate-900">Nemo</h3>
      <p className="mb-6 text-center text-xs leading-relaxed text-slate-500">
        Ask me anything about HAI Accounting.
        <br />
        I can help with invoices, purchases, reports, and more.
      </p>

      <div className="w-full space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Try asking
        </p>
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onQuestionClick(q)}
            className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left text-xs text-slate-600 shadow-2xs transition-all hover:border-teal-200 hover:bg-teal-50/30 hover:text-teal-700 cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-teal-500" />
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Shimmer Skeleton ──────────────────────────────────────────────────

function ChatSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-6">
      {/* Bot message skeleton */}
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 animate-pulse rounded-full bg-slate-200" />
        <div className="space-y-1.5">
          <div className="h-16 w-56 animate-pulse rounded-2xl rounded-bl-md bg-slate-100" />
          <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      {/* User message skeleton */}
      <div className="flex flex-row-reverse items-start gap-2.5">
        <div className="space-y-1.5 flex flex-col items-end">
          <div className="h-10 w-44 animate-pulse rounded-2xl rounded-br-md bg-teal-100" />
          <div className="h-3 w-14 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
      {/* Another bot message skeleton */}
      <div className="flex items-start gap-2.5">
        <div className="h-7 w-7 animate-pulse rounded-full bg-slate-200" />
        <div className="space-y-1.5">
          <div className="h-24 w-64 animate-pulse rounded-2xl rounded-bl-md bg-slate-100" />
          <div className="flex gap-1.5">
            <div className="h-5 w-16 animate-pulse rounded-full bg-teal-50" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-teal-50" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Chat Panel ───────────────────────────────────────────────────

interface ChatbotPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatbotPanel({ isOpen, onClose }: ChatbotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Simulate initialization complete
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsInitializing(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isInitializing) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isInitializing]);

  const sendMessage = useCallback(
    async (questionText?: string) => {
      const question = (questionText || input).trim();
      if (!question || isLoading) return;

      // Add user message
      const userMessage: ChatMessage = {
        role: "user",
        content: question,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const response = await sendChatMessage(question, sessionId);

        if (response.success && response.data) {
          // Update session ID
          if (response.data.sessionId) {
            setSessionId(response.data.sessionId);
          }

          const botMessage: ChatMessage = {
            role: "assistant",
            content: response.data.answer,
            sources: response.data.sources,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, botMessage]);
        } else {
          // API returned an error
          const errorMessage: ChatMessage = {
            role: "assistant",
            content: response.message || "Something went wrong. Please try again.",
            timestamp: Date.now(),
            isError: true,
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } catch (error) {
        // Network error or server down
        const errorMessage: ChatMessage = {
          role: "assistant",
          content: "Unable to connect to the assistant. Please check your connection and try again.",
          timestamp: Date.now(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, sessionId]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleStarterClick = (question: string) => {
    sendMessage(question);
  };

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-[3.5rem] z-50 flex h-[calc(100vh-3.5rem)] w-full flex-col border-l border-slate-200/70 bg-white shadow-2xl transition-transform duration-300 ease-out sm:w-[420px]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* ── Header ── */}
        <div className="flex h-14 shrink-0 items-center justify-between bg-gradient-to-r from-teal-600 to-teal-700 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Nemo</h2>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                <span className="text-[10px] text-teal-100">Online</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            title="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Messages Area ── */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          {isInitializing ? (
            <ChatSkeleton />
          ) : messages.length === 0 ? (
            <WelcomeState onQuestionClick={handleStarterClick} />
          ) : (
            <div className="py-3">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  message={msg}
                  onSourceClick={(title) => {
                    setInput(title);
                    inputRef.current?.focus();
                  }}
                />
              ))}
              {isLoading && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input Area ── */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 transition-colors focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none disabled:opacity-50"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all cursor-pointer",
                input.trim() && !isLoading
                  ? "bg-teal-600 text-white shadow-sm hover:bg-teal-700"
                  : "bg-slate-200 text-slate-400"
              )}
              title="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[9px] text-slate-400">
            Powered by HAI Knowledge Base · Answers may not be perfect
          </p>
        </div>
      </div>
    </>
  );
}
