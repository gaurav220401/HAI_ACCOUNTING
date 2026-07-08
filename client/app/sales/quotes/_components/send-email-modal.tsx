"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/contexts/organization-context";
import {
  Loader2,
  Send,
  X,
  Paperclip,
  FileText,
  Plus,
  Mail,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface SendEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (data: {
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    attachQuotePdf: boolean;
    files: File[];
  }) => Promise<void>;
  defaultRecipient?: string;
  quoteNumber: string;
}

export function SendEmailModal({
  isOpen,
  onClose,
  onSend,
  defaultRecipient = "",
  quoteNumber,
}: SendEmailModalProps) {
  const { activeOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [to, setTo] = useState<string[]>(defaultRecipient ? [defaultRecipient] : []);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState(
    `Quote - ${quoteNumber} from ${activeOrganization?.name || "HAI Accounting"}`
  );
  
  const defaultBody = `Dear Customer,

Thanks for your business. Please find our quote (${quoteNumber}) attached for your reference.

Assuring you of our best services at all times.

Regards,
${activeOrganization?.name || "Team HAI"}`;

  const [body, setBody] = useState(defaultBody);
  const [attachPdf, setAttachPdf] = useState(true);
  const [files, setFiles] = useState<File[]>([]);

  const [toInput, setToInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");

  useEffect(() => {
    if (defaultRecipient && to.length === 0) {
      setTo([defaultRecipient]);
    }
  }, [defaultRecipient]);

  const addTag = (type: "to" | "cc" | "bcc", value: string) => {
    const email = value.trim();
    if (!email || !email.includes("@")) return;
    
    if (type === "to") {
      if (!to.includes(email)) setTo([...to, email]);
      setToInput("");
    } else if (type === "cc") {
      if (!cc.includes(email)) setCc([...cc, email]);
      setCcInput("");
    } else if (type === "bcc") {
      if (!bcc.includes(email)) setBcc([...bcc, email]);
      setBccInput("");
    }
  };

  const removeTag = (type: "to" | "cc" | "bcc", email: string) => {
    if (type === "to") setTo(to.filter((t) => t !== email));
    else if (type === "cc") setCc(cc.filter((t) => t !== email));
    else if (type === "bcc") setBcc(bcc.filter((t) => t !== email));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles([...files, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    // Add current inputs if they look like emails
    if (toInput) addTag("to", toInput);
    
    const finalTo = toInput && toInput.includes("@") && !to.includes(toInput) ? [...to, toInput] : to;

    if (finalTo.length === 0) {
      toast.error("Please add at least one recipient");
      return;
    }

    setLoading(true);
    try {
      await onSend({
        to: finalTo,
        cc,
        bcc,
        subject,
        body,
        attachQuotePdf: attachPdf,
        files,
      });
      toast.success("Email sent successfully");
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to send email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden rounded-xl border-none shadow-2xl">
        <div className="bg-gradient-to-r from-teal-600 to-teal-800 p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
              <Mail className="h-5 w-5" />
              Send Quote
            </DialogTitle>
            <p className="text-teal-100 text-sm mt-1">
              Send professionally formatted quote details to your customers.
            </p>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* TO */}
          <div className="space-y-2">
            <Label>To Recipients</Label>
            <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px] bg-background">
              {to.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1 px-2 py-1">
                  {email}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag("to", email)} />
                </Badge>
              ))}
              <input
                className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
                placeholder={to.length === 0 ? "Enter email and press Enter" : ""}
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag("to", toInput);
                  }
                }}
              />
            </div>
          </div>

          {/* CC & BCC Toggle/Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CC</Label>
              <Input
                placeholder="Enter email and press Enter"
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag("cc", ccInput);
                  }
                }}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {cc.map((email) => (
                  <Badge key={email} variant="outline" className="gap-1">
                    {email}
                    <X className="h-2 w-2 cursor-pointer" onClick={() => removeTag("cc", email)} />
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>BCC</Label>
              <Input
                placeholder="Enter email and press Enter"
                value={bccInput}
                onChange={(e) => setBccInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag("bcc", bccInput);
                  }
                }}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {bcc.map((email) => (
                  <Badge key={email} variant="outline" className="gap-1">
                    {email}
                    <X className="h-2 w-2 cursor-pointer" onClick={() => removeTag("bcc", email)} />
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body">Message Body</Label>
            <Textarea
              id="body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="resize-none"
            />
          </div>

          {/* Attachments */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="attachPdf"
                checked={attachPdf}
                onCheckedChange={(checked) => setAttachPdf(!!checked)}
              />
              <Label htmlFor="attachPdf" className="flex items-center gap-1.5 cursor-pointer">
                <FileText className="h-4 w-4 text-red-500" />
                Attach Quote PDF ({quoteNumber}.pdf)
              </Label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4" />
                  Additional Attachments
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="h-7 text-xs"
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Files
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/30">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-background border rounded px-2 py-1 text-xs"
                    >
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate max-w-[150px]">{file.name}</span>
                      <X
                        className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => removeFile(idx)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 bg-muted/20 border-t flex justify-between items-center sm:justify-between">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="text-slate-500 hover:bg-slate-50">
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading}
            className="bg-teal-600 hover:bg-teal-700 text-white min-w-[120px] gap-2 font-semibold"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
