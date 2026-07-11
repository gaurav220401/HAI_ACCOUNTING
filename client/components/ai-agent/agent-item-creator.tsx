"use client";

import { useEffect, useRef, useState } from "react";
import { createItemWorkflow, askAgent } from "@/lib/api/ai-agent";
import { cn } from "@/lib/utils";
import { Bot, Send, Check, AlertCircle, RefreshCw, ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

interface ChatMessage {
  role: "bot" | "user";
  content: string;
  timestamp: string;
}

export function AgentItemCreator() {
  const router = useRouter();

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isWaitingAI, setIsWaitingAI] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // Collected fields
  const [collectedData, setCollectedData] = useState({
    name: "",
    itemType: "Goods" as "Goods" | "Service",
    sku: "",
    sellingPrice: 0,
    costPrice: 0,
    unit: "",
    description: "",
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Init bot message
  useEffect(() => {
    setMessages([
      {
        role: "bot",
        content: "👋 Hello! I am Nemo, your AI form-filling assistant.\n\nTell me about the item you want to create (e.g., *'I want to add a Service called Consulting at a rate of 500 per hour'*, or *'Add a product named Widget Premium'*). You can speak naturally, and I will extract the details and fill in the form on the right!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isWaitingAI]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const reply = input.trim();
    if (!reply) return;

    // Append user message
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setInput("");
    setIsWaitingAI(true);

    try {
      const res = await askAgent(reply, JSON.stringify(collectedData), "create_item");
      if (res.success && res.data) {
        const { message, fields } = res.data as any;
        if (fields) {
          setCollectedData((prev) => ({
            ...prev,
            ...fields,
            // Ensure type matches enum
            itemType: fields.itemType === "Service" ? "Service" : "Goods",
            sellingPrice: Number(fields.sellingPrice) || 0,
            costPrice: Number(fields.costPrice) || 0,
          }));
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            content: message || "I've updated the form preview.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: "Sorry, I had trouble communicating with the AI. You can still fill out the form manually on the right.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsWaitingAI(false);
    }
  };

  const handleSelectOption = async (option: string) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: option,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setIsWaitingAI(true);

    try {
      const res = await askAgent(option, JSON.stringify(collectedData), "create_item");
      if (res.success && res.data) {
        const { message, fields } = res.data as any;
        if (fields) {
          setCollectedData((prev) => ({
            ...prev,
            ...fields,
            itemType: fields.itemType === "Service" ? "Service" : "Goods",
            sellingPrice: Number(fields.sellingPrice) || 0,
            costPrice: Number(fields.costPrice) || 0,
          }));
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            content: message || "I've updated the form preview.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    } catch (err) {
      // fallback
    } finally {
      setIsWaitingAI(false);
    }
  };

  const handleCreateItem = async () => {
    if (!collectedData.name) return;
    setIsCreating(true);
    setStatusMessage(null);

    try {
      const res = await createItemWorkflow({ collectedData });
      if (res.success && res.data?.status === "completed") {
        setSuccessId(res.data.createdItem?._id || "created");
        setMessages((prev) => [
          ...prev,
          {
            role: "bot",
            content: "🎉 Success! The new item has been added to your catalog database.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } else {
        setStatusMessage(res.data?.errorMessage || "Failed to create item. Please verify required fields.");
      }
    } catch (err: any) {
      setStatusMessage(err.message || "A network error occurred. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
      {/* Left Chat Wizard */}
      <div className="lg:col-span-3 flex flex-col bg-slate-50/20 overflow-hidden h-[calc(100vh-140px)]">
        {/* Chat banner indicator */}
        <div className="bg-teal-50/75 border-b border-teal-100 px-5 py-2.5 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-teal-600 animate-pulse" />
          <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wide">
            Dynamic Gemini AI Field Extractor
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={cn("flex gap-3.5", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              {msg.role === "bot" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 shadow-sm text-white">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={cn("max-w-[75%] space-y-1", msg.role === "user" && "flex flex-col items-end")}>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-3xs",
                    msg.role === "user"
                      ? "bg-teal-600 text-white rounded-br-md"
                      : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"
                  )}
                >
                  <p className="whitespace-pre-line">{msg.content}</p>
                </div>
                <span className="text-[9px] text-slate-400 px-1">{msg.timestamp}</span>
              </div>
            </div>
          ))}

          {isWaitingAI && (
            <div className="flex gap-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-1 shadow-3xs">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {/* Quick Click helper options */}
          <div className="flex flex-wrap justify-start pl-11 gap-2 select-none">
            <button
              onClick={() => handleSelectOption("Change type to Goods")}
              className="bg-white border border-slate-200 text-slate-650 hover:border-teal-500 hover:text-teal-600 rounded-lg px-2.5 py-1 text-[10px] font-semibold shadow-3xs cursor-pointer transition-colors"
            >
              📦 Goods
            </button>
            <button
              onClick={() => handleSelectOption("Change type to Service")}
              className="bg-white border border-slate-200 text-slate-650 hover:border-teal-500 hover:text-teal-600 rounded-lg px-2.5 py-1 text-[10px] font-semibold shadow-3xs cursor-pointer transition-colors"
            >
              🛠️ Service
            </button>
            <button
              onClick={() => handleSelectOption("Skip SKU code")}
              className="bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 rounded-lg px-2.5 py-1 text-[10px] font-semibold shadow-3xs cursor-pointer transition-colors"
            >
              ➡️ Skip SKU
            </button>
            <button
              onClick={() => handleSelectOption("Unit is pcs")}
              className="bg-white border border-slate-200 text-slate-650 hover:border-teal-500 hover:text-teal-600 rounded-lg px-2.5 py-1 text-[10px] font-semibold shadow-3xs cursor-pointer transition-colors"
            >
              pcs
            </button>
            <button
              onClick={() => handleSelectOption("Unit is hours")}
              className="bg-white border border-slate-200 text-slate-650 hover:border-teal-500 hover:text-teal-600 rounded-lg px-2.5 py-1 text-[10px] font-semibold shadow-3xs cursor-pointer transition-colors"
            >
              hrs
            </button>
          </div>

          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <form onSubmit={handleSendMessage} className="flex gap-2.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isWaitingAI || successId !== null}
              placeholder={successId ? "Item successfully created!" : "Talk to Nemo to populate fields..."}
              className="flex-1 rounded-xl border border-slate-255 py-2 px-3 text-xs bg-slate-50 focus:bg-white focus:border-teal-500 focus:outline-none placeholder-slate-400 text-slate-850 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isWaitingAI || successId !== null}
              className="h-8.5 w-8.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center shadow-xs transition-all disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Right Form Preview */}
      <div className="lg:col-span-2 p-5 bg-white overflow-y-auto h-[calc(100vh-140px)] flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Form Preview</h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-600 border border-teal-150">
              Live Autofill
            </span>
          </div>

          <div className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-650 flex items-center justify-between">
                <span>Item Name *</span>
                {collectedData.name && <Check className="h-3.5 w-3.5 text-teal-600 animate-scale-in" />}
              </label>
              <div
                className={cn(
                  "p-2 text-xs rounded-lg border text-slate-800 font-medium min-h-8.5 flex items-center bg-slate-50 transition-all",
                  collectedData.name ? "border-teal-550 bg-teal-50/20 font-semibold" : "border-slate-200 border-dashed"
                )}
              >
                {collectedData.name || <span className="text-slate-400 italic font-normal">Waiting for name...</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-650 flex items-center justify-between">
                  <span>Item Type</span>
                  <Check className="h-3.5 w-3.5 text-teal-600" />
                </label>
                <div className="p-2 text-xs rounded-lg border border-teal-550 bg-teal-50/20 text-slate-800 font-semibold min-h-8.5 flex items-center">
                  {collectedData.itemType}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-650 flex items-center justify-between">
                  <span>SKU Code</span>
                  {collectedData.sku && <Check className="h-3.5 w-3.5 text-teal-600" />}
                </label>
                <div
                  className={cn(
                    "p-2 text-xs rounded-lg border text-slate-850 min-h-8.5 flex items-center bg-slate-50 transition-all",
                    collectedData.sku ? "border-teal-550 bg-teal-50/20 font-medium" : "border-slate-200"
                  )}
                >
                  {collectedData.sku || <span className="text-slate-400 italic font-normal">Optional SKU...</span>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-650 flex items-center justify-between">
                  <span>Selling Price</span>
                  {collectedData.sellingPrice > 0 && <Check className="h-3.5 w-3.5 text-teal-600" />}
                </label>
                <div
                  className={cn(
                    "p-2 text-xs rounded-lg border text-slate-850 font-semibold min-h-8.5 flex items-center bg-slate-50 transition-all",
                    collectedData.sellingPrice > 0 ? "border-teal-550 bg-teal-50/20" : "border-slate-200"
                  )}
                >
                  INR {collectedData.sellingPrice.toFixed(2)}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-650 flex items-center justify-between">
                  <span>Cost Price</span>
                  {collectedData.costPrice > 0 && <Check className="h-3.5 w-3.5 text-teal-600" />}
                </label>
                <div
                  className={cn(
                    "p-2 text-xs rounded-lg border text-slate-850 font-semibold min-h-8.5 flex items-center bg-slate-50 transition-all",
                    collectedData.costPrice > 0 ? "border-teal-550 bg-teal-50/20" : "border-slate-200"
                  )}
                >
                  INR {collectedData.costPrice.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-650 flex items-center justify-between">
                <span>Measurement Unit</span>
                {collectedData.unit && <Check className="h-3.5 w-3.5 text-teal-600" />}
              </label>
              <div
                className={cn(
                  "p-2 text-xs rounded-lg border text-slate-855 min-h-8.5 flex items-center bg-slate-50 transition-all",
                  collectedData.unit ? "border-teal-550 bg-teal-50/20 font-medium" : "border-slate-200"
                )}
              >
                {collectedData.unit || <span className="text-slate-400 italic">pcs, box, kg...</span>}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-650 flex items-center justify-between">
                <span>Description</span>
                {collectedData.description && <Check className="h-3.5 w-3.5 text-teal-600" />}
              </label>
              <div
                className={cn(
                  "p-2.5 text-xs rounded-lg border text-slate-800 min-h-16 flex items-start bg-slate-50 leading-relaxed transition-all",
                  collectedData.description ? "border-teal-550 bg-teal-50/20" : "border-slate-200"
                )}
              >
                {collectedData.description || <span className="text-slate-400 italic">Enter description...</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
          {statusMessage && (
            <div className="p-3 border border-rose-250 bg-rose-50 text-rose-800 text-xs rounded-xl flex items-start gap-2 select-all leading-relaxed">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {statusMessage}
            </div>
          )}

          {successId ? (
            <div className="space-y-2.5">
              <div className="p-3 border border-teal-200 bg-teal-50/50 text-teal-800 text-xs rounded-xl flex items-start gap-2 leading-relaxed">
                <Check className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Item successfully created! You can now view it under Catalogue.</span>
              </div>
              <button
                onClick={() => router.push("/items")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs cursor-pointer transition-colors"
              >
                Go to Items List
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleCreateItem}
              disabled={isCreating || !collectedData.name}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating Item...
                </>
              ) : (
                "Create Item"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
