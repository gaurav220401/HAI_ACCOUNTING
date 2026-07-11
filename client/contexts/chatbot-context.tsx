"use client";

import * as React from "react";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/api/chatbot";

export interface ChatSession {
  _id: string;
  title: string;
  lastActivity: number;
  updatedAt?: number;
  createdAt: number;
}

interface ChatbotContextType {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  sessionId: string | undefined;
  setSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  sessions: ChatSession[];
  sessionsLoading: boolean;
  sendMessage: (questionText?: string) => Promise<void>;
  handleNewChat: () => void;
  fetchSessions: () => Promise<void>;
  handleLoadSession: (id: string) => Promise<void>;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export function ChatbotProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/chat-sessions");
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.data) {
          setSessions(body.data);
          return;
        }
      }
      const localSess = localStorage.getItem("hai_chat_sessions");
      if (localSess) {
        setSessions(JSON.parse(localSess));
      }
    } catch (e) {
      const localSess = localStorage.getItem("hai_chat_sessions");
      if (localSess) {
        setSessions(JSON.parse(localSess));
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const handleLoadSession = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/chat-sessions/${id}`);
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.data) {
          setSessionId(body.data._id);
          setMessages(body.data.messages || []);
          return;
        }
      }
      const localSess = localStorage.getItem("hai_chat_sessions");
      if (localSess) {
        const list: any[] = JSON.parse(localSess);
        const found = list.find((s) => s._id === id);
        if (found) {
          setSessionId(found._id);
          setMessages(found.messages || []);
        }
      }
    } catch (e) {
      const localSess = localStorage.getItem("hai_chat_sessions");
      if (localSess) {
        const list: any[] = JSON.parse(localSess);
        const found = list.find((s) => s._id === id);
        if (found) {
          setSessionId(found._id);
          setMessages(found.messages || []);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(undefined);
  };

  const sendMessage = useCallback(
    async (questionText?: string) => {
      const question = (questionText || input).trim();
      if (!question || isLoading) return;

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
          const sId = response.data.sessionId || sessionId || `local_${Date.now()}`;
          if (response.data.sessionId) {
            setSessionId(response.data.sessionId);
          } else if (!sessionId) {
            setSessionId(sId);
          }

          const botMessage: ChatMessage = {
            role: "assistant",
            content: response.data.answer,
            sources: response.data.sources,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, botMessage]);

          try {
            const localSess = localStorage.getItem("hai_chat_sessions") || "[]";
            const list: any[] = JSON.parse(localSess);
            let existingIdx = list.findIndex((s) => s._id === sId);
            if (existingIdx > -1) {
              list[existingIdx].messages = [...list[existingIdx].messages, userMessage, botMessage];
              list[existingIdx].lastActivity = Date.now();
              list[existingIdx].updatedAt = Date.now();
            } else {
              list.push({
                _id: sId,
                title: question.substring(0, 50),
                messages: [userMessage, botMessage],
                lastActivity: Date.now(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            }
            localStorage.setItem("hai_chat_sessions", JSON.stringify(list));
            fetchSessions();
          } catch (e) {
            console.error("Local storage save failed:", e);
          }
        } else {
          const errorMessage: ChatMessage = {
            role: "assistant",
            content: response.message || "Something went wrong. Please try again.",
            timestamp: Date.now(),
            isError: true,
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } catch (error) {
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
    [input, isLoading, sessionId, fetchSessions]
  );

  return (
    <ChatbotContext.Provider
      value={{
        messages,
        setMessages,
        input,
        setInput,
        isLoading,
        sessionId,
        setSessionId,
        sessions,
        sessionsLoading,
        sendMessage,
        handleNewChat,
        fetchSessions,
        handleLoadSession,
      }}
    >
      {children}
    </ChatbotContext.Provider>
  );
}

export function useChatbot() {
  const context = useContext(ChatbotContext);
  if (context === undefined) {
    throw new Error("useChatbot must be used within a ChatbotProvider");
  }
  return context;
}
