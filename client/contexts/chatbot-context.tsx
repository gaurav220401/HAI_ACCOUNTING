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
import { uploadApi } from "@/lib/api/upload";
import { toast } from "sonner";
import { useFormAgent } from "@/hooks/use-form-agent";

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
  
  // Multimodal file upload features
  pendingFiles: Array<{ url: string; originalName: string; publicId: string }>;
  setPendingFiles: React.Dispatch<React.SetStateAction<Array<{ url: string; originalName: string; publicId: string }>>>;
  uploadingFiles: boolean;
  handleUploadFiles: (files: FileList) => Promise<void>;
  handleRemovePendingFile: (publicId: string) => Promise<void>;

  // AI Agent form automation status
  agentActive: boolean;
  agentStatus: "idle" | "navigating" | "typing" | "completed" | "failed";
  agentProgressMsg: string;

  // Programmatic Chat Drawer Control
  chatOpen: boolean;
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Session Deletion
  handleDeleteSession: (id: string) => Promise<void>;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export function ChatbotProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // File upload state variables
  const [pendingFiles, setPendingFiles] = useState<Array<{ url: string; originalName: string; publicId: string }>>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Chat panel open state
  const [chatOpen, setChatOpen] = useState(false);

  // AI Agent form automation states
  const [agentActive, setAgentActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState<"idle" | "navigating" | "typing" | "completed" | "failed">("idle");
  const [agentProgressMsg, setAgentProgressMsg] = useState("");

  const { executeFormFilling } = useFormAgent();

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await getSessions();
      if (res.success && res.data) {
        setSessions(res.data);
        return;
      }
      const localSess = localStorage.getItem("hai_chat_sessions");
      if (localSess) setSessions(JSON.parse(localSess));
    } catch (e) {
      const localSess = localStorage.getItem("hai_chat_sessions");
      if (localSess) setSessions(JSON.parse(localSess));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleLoadSession = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await getSession(id);
      if (res.success && res.data) {
        setSessionId(res.data._id);
        setMessages(res.data.messages || []);
        return;
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

  const handleNewChat = async () => {
    setMessages([]);
    setIsLoading(true);
    setPendingFiles([]);
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

  // Upload selected files
  const handleUploadFiles = async (files: FileList) => {
    setUploadingFiles(true);
    const uploadedList = [...pendingFiles];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await uploadApi.upload(file, "chat-attachments");
        uploadedList.push({
          url: res.url,
          originalName: res.originalName || file.name,
          publicId: res.publicId,
        });
      }
      setPendingFiles(uploadedList);
      toast.success(`${files.length} file(s) uploaded successfully.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file(s).");
    } finally {
      setUploadingFiles(false);
    }
  };

  // Remove a pending file
  const handleRemovePendingFile = async (publicId: string) => {
    try {
      await uploadApi.remove(publicId);
      setPendingFiles((prev) => prev.filter((f) => f.publicId !== publicId));
      toast.success("Attachment removed.");
    } catch (err) {
      // Clean up locally even if API fails
      setPendingFiles((prev) => prev.filter((f) => f.publicId !== publicId));
    }
  };

// Helper to scan DOM for form inputs and their labels
function getActiveFormContext(): string {
  if (typeof window === "undefined") return "";

  const inputs = Array.from(
    document.querySelectorAll("input, textarea, button[role='combobox'], [role='checkbox']")
  ) as HTMLElement[];

  // Filter out chatbot-panel inputs and hidden elements
  const visibleFormInputs = inputs.filter((input) => {
    if (input.closest(".fixed.right-0") || input.closest("#chatbot-panel")) {
      return false;
    }
    return input.offsetParent !== null;
  });

  if (visibleFormInputs.length < 2) return "";

  const fields: string[] = [];
  visibleFormInputs.forEach((input) => {
    const id = input.getAttribute("id");
    const name = input.getAttribute("name");
    const placeholder = input.getAttribute("placeholder");
    let labelText = "";

    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) labelText = label.textContent?.trim() || "";
    }
    if (!labelText) {
      const parentLabel = input.closest("label");
      if (parentLabel) labelText = parentLabel.textContent?.trim() || "";
    }
    if (!labelText) {
      const parent = input.parentElement;
      if (parent) {
        const label = parent.querySelector("label");
        if (label) labelText = label.textContent?.trim() || "";
      }
    }

    const labelStr = labelText ? labelText.replace(/[*:]/g, "").trim() : "";
    const nameStr = name || "";
    const placeholderStr = placeholder || "";

    const descriptor = labelStr || placeholderStr || nameStr;
    if (descriptor && !fields.includes(descriptor)) {
      fields.push(descriptor);
    }
  });

  if (fields.length > 0) {
    return `ACTIVE_FORM_CONTEXT:
Current Route: ${window.location.pathname}
Visible form fields that can be populated: ${JSON.stringify(fields)}
Please use this schema context to accurately map the user's details and trigger the correct NAVIGATE_AND_FILL route and properties.`;
  }
  return "";
}

  const sendMessage = useCallback(
    async (questionText?: string) => {
      const question = (questionText || input).trim();
      if (!question || isLoading) return;

      // Append attachment links to user message for UI display
      let displayContent = question;
      if (pendingFiles.length > 0) {
        const fileLinks = pendingFiles
          .map((f) => `📎 [${f.originalName}](${f.url})`)
          .join("\n");
        displayContent += `\n\nAttachments:\n${fileLinks}`;
      }

      const userMessage: ChatMessage = {
        role: "user",
        content: displayContent,
        timestamp: Date.now(),
      };
      
      const historyContext = [...messages];
      const filesToSend = [...pendingFiles];
      
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setPendingFiles([]); // Clear pending files list
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

        const formContext = getActiveFormContext();
        const apiQuestion = formContext
          ? `${formContext}\n\nUSER_REQUEST: ${question}`
          : question;

        const response = await sendChatMessage(apiQuestion, activeSessionId, historyContext, filesToSend);

        if (response.success && response.data) {
          if (response.data.sessionId) {
            setSessionId(response.data.sessionId);
          }

          let cleanAnswer = response.data.answer;
          let actionData: any = null;

          // Parse action triggers wrapped in <action_trigger> tags
          const actionRegex = /<action_trigger>([\s\S]*?)<\/action_trigger>/;
          const match = cleanAnswer.match(actionRegex);
          if (match) {
            try {
              actionData = JSON.parse(match[1].trim());
              cleanAnswer = cleanAnswer.replace(actionRegex, "").trim();
            } catch (e) {
              console.error("Failed to parse agent action trigger:", e);
            }
          }

          const botMessage: ChatMessage = {
            role: "assistant",
            content: cleanAnswer,
            sources: response.data.sources,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, botMessage]);
          fetchSessions();

          // If action is received, trigger form automation
          if (actionData && actionData.action === "NAVIGATE_AND_FILL" && actionData.route) {
            setChatOpen(true);
            setAgentActive(true);
            setAgentStatus("navigating");
            setAgentProgressMsg("Preparing form automation...");

            setTimeout(() => {
              executeFormFilling(
                actionData.route,
                actionData.data || {},
                (progressMsg) => {
                  setAgentStatus("typing");
                  setAgentProgressMsg(progressMsg);
                },
                () => {
                  setAgentActive(false);
                  setAgentStatus("idle");
                  setAgentProgressMsg("");
                }
              );
            }, 500);
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
    [input, isLoading, sessionId, messages, fetchSessions, pendingFiles, executeFormFilling]
  );

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      const res = await deleteSession(id);
      if (res.success) {
        toast.success("Conversation deleted.");
        fetchSessions();
        if (sessionId === id) {
          handleNewChat();
        }
      } else {
        toast.error(res.message || "Failed to delete conversation.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete conversation.");
    }
  }, [sessionId, fetchSessions, handleNewChat]);

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
        
        // Expose file upload states
        pendingFiles,
        setPendingFiles,
        uploadingFiles,
        handleUploadFiles,
        handleRemovePendingFile,

        // Expose AI Agent states
        agentActive,
        agentStatus,
        agentProgressMsg,

        // Expose Chat open states
        chatOpen,
        setChatOpen,

        // Expose session deletion
        handleDeleteSession,
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
