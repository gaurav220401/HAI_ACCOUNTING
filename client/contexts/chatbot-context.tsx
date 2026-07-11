"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback } from "react";
import { 
  sendChatMessage, 
  getSessions, 
  getSession, 
  createSession, 
  deleteSession,
  type ChatMessage,
  type ChatSession 
} from "@/lib/api/chatbot";

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
      const res = await getSessions();
      if (res.success && res.data) {
        setSessions(res.data);
        return;
      }
      // Graceful fallback to localStorage in case of error or setup
      const localSess = localStorage.getItem("hai_chat_sessions");
      if (localSess) setSessions(JSON.parse(localSess));
    } catch (e) {
      const localSess = localStorage.getItem("hai_chat_sessions");
      if (localSess) setSessions(JSON.parse(localSess));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const handleLoadSession = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await getSession(id);
      if (res.success && res.data) {
        setSessionId(res.data._id);
        setMessages(res.data.messages || []);
        return;
      }
      // Fallback to local storage session
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

  const handleNewChat = async () => {
    setMessages([]);
    setIsLoading(true);
    try {
      const res = await createSession();
      if (res.success && res.data) {
        setSessionId(res.data._id);
        fetchSessions();
      } else {
        setSessionId(undefined);
      }
    } catch (e) {
      setSessionId(undefined);
    } finally {
      setIsLoading(false);
    }
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
      
      // Keep track of messages history before appending the new one
      const historyContext = [...messages];
      
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        let activeSessionId = sessionId;
        if (!activeSessionId) {
          const createRes = await createSession(question.substring(0, 50));
          if (createRes.success && createRes.data) {
            activeSessionId = createRes.data._id;
            setSessionId(activeSessionId);
          }
        }

        const response = await sendChatMessage(question, activeSessionId, historyContext);

        if (response.success && response.data) {
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
          fetchSessions();
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
    [input, isLoading, sessionId, messages, fetchSessions]
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
