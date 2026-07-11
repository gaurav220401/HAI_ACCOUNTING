"use client";

import { useEffect, useRef, useState } from "react";
import { createItemWorkflow } from "@/lib/api/ai-agent";
import { cn } from "@/lib/utils";
import { Bot, Send, Check, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface ChatMessage {
  role: "bot" | "user";
  content: string;
  timestamp: string;
}

export function AgentItemCreator() {
  const router = useRouter();

  // Wizard state machine
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
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
        content: "👋 Hello! I will guide you through creating a new item in your accounting inventory. To start, **what is the name of the item**?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addBotMessage = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "bot",
        content,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const handleSendMessage = (e?: React.FormEvent) => {
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

    // Staggered parsing logic
    setTimeout(() => {
      processStep(reply);
    }, 600);
  };

  const processStep = (reply: string) => {
    const replyLower = reply.toLowerCase();

    if (step === 0) {
      setCollectedData((prev) => ({ ...prev, name: reply }));
      setStep(1);
      addBotMessage(`Got it, **"${reply}"**. Is this item a **Goods** or a **Service**?`);
    } else if (step === 1) {
      const type = replyLower.includes("service") ? "Service" : "Goods";
      setCollectedData((prev) => ({ ...prev, itemType: type }));
      setStep(2);
      addBotMessage(`Understood, set as **${type}**. What is the **SKU code** for this item? (Say "skip" or "none" if you don't have one).`);
    } else if (step === 2) {
      const sku = (replyLower === "skip" || replyLower === "none") ? "" : reply;
      setCollectedData((prev) => ({ ...prev, sku }));
      setStep(3);
      addBotMessage(
        sku 
          ? `SKU set to **"${sku}"**. What is the **Selling Price (INR)**?`
          : `SKU skipped. What is the **Selling Price (INR)**?`
      );
    } else if (step === 3) {
      const price = parseFloat(reply) || 0;
      setCollectedData((prev) => ({ ...prev, sellingPrice: price }));
      setStep(4);
      addBotMessage(`Selling Price set to **INR ${price.toFixed(2)}**. Next, what is the **Cost Price (INR)**? (You can say 0 or skip).`);
    } else if (step === 4) {
      const price = parseFloat(reply) || 0;
      setCollectedData((prev) => ({ ...prev, costPrice: price }));
      setStep(5);
      addBotMessage(`Cost Price set to **INR ${price.toFixed(2)}**. What is the **Measurement Unit**? (e.g. pcs, box, kg).`);
    } else if (step === 5) {
      const unit = reply;
      setCollectedData((prev) => ({ ...prev, unit }));
      setStep(6);
      addBotMessage(`Unit set to **"${unit}"**. Almost done! Please enter a **brief description** for this item:`);
    } else if (step === 6) {
      setCollectedData((prev) => ({ ...prev, description: reply }));
      setStep(7);
      addBotMessage(`Excellent! All details collected. You can review the form preview on the right. When ready, click **Create Item** to finalize.`);
    } else {
      addBotMessage(`All fields are already collected. Click **Create Item** on the form preview panel to create the item in the database.`);
    }
  };

  const handleSelectOption = (option: string) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: option,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setTimeout(() => {
      processStep(option);
    }, 600);
  };

  const handleCreateItem = async () => {
    if (!collectedData.name) return;
    setIsCreating(true);
    setStatusMessage(null);

    try {
      const res = await createItemWorkflow({ collectedData });
      if (res.success && res.data?.status === "completed") {
        setSuccessId(res.data.createdItem?._id || "created");
        addBotMessage("🎉 Success! The new item has been added to your catalog database.");
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

          {/* Inline helper options for clicking */}
          {step === 1 && (
            <div className="flex justify-start pl-11 gap-2 select-none">
              <button
                onClick={() => handleSelectOption("Goods")}
                className="bg-white border border-slate-200 text-slate-650 hover:border-teal-500 hover:text-teal-600 rounded-lg px-4 py-1.5 text-xs font-semibold shadow-3xs cursor-pointer transition-colors"
              >
                📦 Goods
              </button>
              <button
                onClick={() => handleSelectOption("Service")}
                className="bg-white border border-slate-200 text-slate-650 hover:border-teal-500 hover:text-teal-600 rounded-lg px-4 py-1.5 text-xs font-semibold shadow-3xs cursor-pointer transition-colors"
              >
                🛠️ Service
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex justify-start pl-11 gap-2 select-none">
              <button
                onClick={() => handleSelectOption("Skip")}
                className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg px-4 py-1.5 text-xs font-semibold shadow-3xs cursor-pointer transition-colors"
              >
                ➡️ Skip SKU
              </button>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <form onSubmit={handleSendMessage} className="flex gap-2.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={step === 7 || successId !== null}
              placeholder={step === 7 ? "All details collected!" : "Type your reply..."}
              className="flex-1 rounded-xl border border-slate-250 py-2 px-3 text-xs bg-slate-50 focus:bg-white focus:border-teal-500 focus:outline-none placeholder-slate-400 text-slate-850 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || step === 7 || successId !== null}
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
                {collectedData.name && <Check className="h-3.5 w-3.5 text-teal-600" />}
              </label>
              <div
                className={cn(
                  "p-2 text-xs rounded-lg border text-slate-800 font-medium min-h-8.5 flex items-center bg-slate-50",
                  collectedData.name ? "border-teal-500/35 bg-teal-500/2" : "border-slate-200 border-dashed"
                )}
              >
                {collectedData.name || <span className="text-slate-400 italic">Enter item name...</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-650 flex items-center justify-between">
                  <span>Item Type</span>
                  <Check className="h-3.5 w-3.5 text-teal-600" />
                </label>
                <div className="p-2 text-xs rounded-lg border border-teal-500/35 bg-teal-500/2 text-slate-800 font-semibold min-h-8.5 flex items-center">
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
                    "p-2 text-xs rounded-lg border text-slate-850 min-h-8.5 flex items-center bg-slate-50",
                    collectedData.sku ? "border-teal-500/35 bg-teal-500/2" : "border-slate-200"
                  )}
                >
                  {collectedData.sku || <span className="text-slate-400 italic font-normal">Optional...</span>}
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
                    "p-2 text-xs rounded-lg border text-slate-850 font-semibold min-h-8.5 flex items-center bg-slate-50",
                    collectedData.sellingPrice > 0 ? "border-teal-500/35 bg-teal-500/2" : "border-slate-200"
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
                    "p-2 text-xs rounded-lg border text-slate-850 font-semibold min-h-8.5 flex items-center bg-slate-50",
                    collectedData.costPrice > 0 ? "border-teal-500/35 bg-teal-500/2" : "border-slate-200"
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
                  "p-2 text-xs rounded-lg border text-slate-850 min-h-8.5 flex items-center bg-slate-50",
                  collectedData.unit ? "border-teal-500/35 bg-teal-500/2" : "border-slate-200"
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
                  "p-2.5 text-xs rounded-lg border text-slate-800 min-h-16 flex items-start bg-slate-50 leading-relaxed",
                  collectedData.description ? "border-teal-500/35 bg-teal-500/2" : "border-slate-200"
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
