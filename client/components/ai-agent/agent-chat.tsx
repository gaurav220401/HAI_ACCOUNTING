"use client";

import { useEffect, useRef } from "react";
import { useChatbot } from "@/contexts/chatbot-context";
import { cn } from "@/lib/utils";
import { Bot, Send, MessageSquare, RefreshCw, Paperclip, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STARTER_QUESTIONS = [
  "Analyze my inventory and tell me what's running low",
  "Help me create a new item step by step",
  "Walk me through creating a sales order",
  "What are my top 5 customers by revenue?",
  "Export my items data to Excel",
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AgentChat() {
  const {
    messages,
    input,
    setInput,
    isLoading,
    sessionId,
    sessions,
    sessionsLoading,
    sendMessage,
    handleNewChat,
    fetchSessions,
    handleLoadSession,
    pendingFiles,
    uploadingFiles,
    handleUploadFiles,
    handleRemovePendingFile,
  } = useChatbot();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || pendingFiles.length > 0) {
        sendMessage();
      }
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sessions Sidebar */}
      <div className="w-64 shrink-0 border-r border-slate-200 bg-slate-50/60 p-4 flex flex-col gap-4">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-700 transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          New Conversation
        </button>

        <div className="flex-1 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 px-2">Recent Chats</p>
          {sessionsLoading ? (
            <div className="space-y-2.5 animate-pulse px-2">
              <div className="h-4 bg-slate-200 rounded w-4/5" />
              <div className="h-4 bg-slate-200 rounded w-2/3" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No recent conversations.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {sessions.map((sess) => (
                <button
                  key={sess._id}
                  onClick={() => handleLoadSession(sess._id)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-xl transition-all flex flex-col gap-1 border border-transparent",
                    sessionId === sess._id
                      ? "bg-teal-50 border-teal-150 text-teal-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  )}
                >
                  <span className="text-xs truncate block w-full">{sess.title || "Untitled Chat"}</span>
                  <span className="text-[9px] text-slate-400">
                    {new Date(sess.updatedAt || sess.lastActivity || sess.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Display */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 shadow-sm shadow-teal-500/20">
                <span className="text-2xl select-none">🤖</span>
              </div>
              <h3 className="text-base font-bold text-slate-800">Hi, I'm Nemo</h3>
              <p className="text-xs text-slate-500 text-center mt-1 mb-6 leading-relaxed">
                Your synchronized AI Accounting Assistant. Let's work together to manage invoices, analyze products, and automate workflows.
              </p>
              <div className="w-full grid grid-cols-2 gap-3">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="p-3 text-left rounded-xl border border-slate-200 bg-slate-50/50 text-xs text-slate-600 hover:border-teal-500/30 hover:bg-teal-500/5 transition-all cursor-pointer flex items-start gap-2"
                  >
                    <span className="text-sm shrink-0 mt-0.5">💬</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div key={i} className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
                    {!isUser && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 shadow-sm">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div className={cn("max-w-[80%] space-y-1", isUser && "flex flex-col items-end")}>
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                          isUser
                            ? "bg-teal-600 text-white rounded-br-md shadow-sm"
                            : "bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-md"
                        )}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        ) : (
                          <div className="prose prose-sm max-w-none text-slate-800">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                strong: ({ ...props }) => <strong className="font-bold text-teal-800" {...props} />,
                                h1: ({ ...props }) => <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />,
                                h2: ({ ...props }) => <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />,
                                h3: ({ ...props }) => <h3 className="text-sm font-bold text-teal-800 mt-2 mb-1" {...props} />,
                                ul: ({ ...props }) => <ul className="list-disc pl-4 space-y-1 my-1" {...props} />,
                                ol: ({ ...props }) => <ol className="list-decimal pl-4 space-y-1 my-1" {...props} />,
                                li: ({ ...props }) => <li className="text-slate-700" {...props} />,
                                a: ({ ...props }) => <a className="text-teal-600 underline hover:text-teal-700" {...props} />,
                                p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 px-1">{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500 [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Form */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/20">
          <div className="max-w-3xl mx-auto space-y-2.5">
            {/* Pending attachments strip */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1 max-h-24 overflow-y-auto">
                {pendingFiles.map((file) => (
                  <div
                    key={file.publicId}
                    className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl pl-3 pr-2 py-1 text-xs text-slate-700 font-semibold shadow-3xs"
                  >
                    <span className="truncate max-w-[150px]">{file.originalName}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePendingFile(file.publicId)}
                      className="text-slate-450 hover:text-slate-750 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 items-end bg-white border border-slate-205 rounded-2xl p-2.5 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/10 transition-all shadow-2xs">
              {/* Attachment selector */}
              <button
                type="button"
                disabled={isLoading || uploadingFiles}
                onClick={() => fileInputRef.current?.click()}
                className="h-8.5 w-8.5 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer transition-colors shrink-0"
                title="Attach documents or images"
              >
                {uploadingFiles ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin text-teal-600" />
                ) : (
                  <Paperclip className="h-4.5 w-4.5" />
                )}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleUploadFiles(e.target.files);
                  }
                }}
              />

              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Nemo or attach invoices, receipts, and files..."
                disabled={isLoading}
                className="flex-1 bg-transparent border-0 resize-none py-1.5 px-3 text-sm focus:outline-none placeholder-slate-400 text-slate-800 disabled:opacity-50 max-h-24 overflow-y-auto"
              />

              <button
                onClick={() => sendMessage()}
                disabled={(!input.trim() && pendingFiles.length === 0) || isLoading}
                className={cn(
                  "h-8.5 w-8.5 rounded-xl flex items-center justify-center cursor-pointer transition-all shrink-0",
                  (input.trim() || pendingFiles.length > 0) && !isLoading
                    ? "bg-teal-600 hover:bg-teal-700 text-white shadow-xs"
                    : "bg-slate-100 text-slate-400"
                )}
                title="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
