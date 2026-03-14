"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { 
  Bold, Italic, Underline, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Type,
  Eraser, Link as LinkIcon, Strikethrough, Image as ImageIcon,
  ChevronDown
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
  placeholder?: string;
  className?: string;
  toolbarClassName?: string;
  editorClassName?: string;
  minHeight?: string;
}

export interface RichTextEditorRef {
  getHtml: () => string;
  setHtml: (html: string) => void;
  focus: () => void;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ value, onChange, onImageUpload, placeholder, className, toolbarClassName, editorClassName, minHeight = "150px" }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [linkUrl, setLinkUrl] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [isLinkOpen, setIsLinkOpen] = useState(false);
    const [isImageOpen, setIsImageOpen] = useState(false);
    const [savedRange, setSavedRange] = useState<Range | null>(null);

    useImperativeHandle(ref, () => ({
      getHtml: () => editorRef.current?.innerHTML || "",
      setHtml: (html: string) => {
        if (editorRef.current) editorRef.current.innerHTML = html;
      },
      focus: () => editorRef.current?.focus(),
    }));

    // Handle initial value
    useEffect(() => {
      if (editorRef.current && editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }, [value]);

    const handleInput = () => {
      const html = editorRef.current?.innerHTML || "";
      onChange(html);
    };

    const execCommand = (command: string, value: string = "") => {
      editorRef.current?.focus();
      if (savedRange) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
      }
      
      if (command === "createLink") {
        const sel = window.getSelection();
        if (sel && sel.isCollapsed) {
          // If no text is selected, insert the URL as text and link it
          const link = document.createElement("a");
          link.href = value;
          link.innerText = value;
          link.target = "_blank";
          savedRange?.insertNode(link);
          // Move cursor after the link
          const range = document.createRange();
          range.setStartAfter(link);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          document.execCommand(command, false, value);
        }
      } else {
        document.execCommand(command, false, value);
      }
      
      handleInput();
      setSavedRange(null);
    };

    const saveSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        setSavedRange(sel.getRangeAt(0));
      }
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onImageUpload) {
        try {
          const url = await onImageUpload(file);
          execCommand("insertImage", url);
        } catch (error) {
          console.error("Image upload failed:", error);
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
      <div className={cn("flex flex-col border rounded-md overflow-hidden bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all", className)}>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleImageChange}
        />
        {/* Toolbar */}
        <div className={cn("flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-gray-50/50", toolbarClassName)}>
          <ToolbarButton onClick={() => execCommand("bold")} icon={<Bold className="h-3.5 w-3.5" />} title="Bold" />
          <ToolbarButton onClick={() => execCommand("italic")} icon={<Italic className="h-3.5 w-3.5" />} title="Italic" />
          <ToolbarButton onClick={() => execCommand("underline")} icon={<Underline className="h-3.5 w-3.5" />} title="Underline" />
          <ToolbarButton onClick={() => execCommand("strikeThrough")} icon={<Strikethrough className="h-3.5 w-3.5" />} title="Strikethrough" />
          
          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          <div className="flex items-center gap-1 mx-1">
            <Select onValueChange={(v) => execCommand("fontSize", v)}>
              <SelectTrigger className="h-7 w-20 text-[11px] bg-white border-none shadow-none focus:ring-0">
                <SelectValue placeholder="16px" />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "3", "4", "5", "6", "7"].map(s => (
                  <SelectItem key={s} value={s} className="text-[11px]">{s === "1" ? "10px" : s === "2" ? "13px" : s === "3" ? "16px" : s === "4" ? "18px" : s === "5" ? "24px" : s === "6" ? "32px" : "48px"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="w-px h-4 bg-gray-300" />
            <Select onValueChange={(v) => execCommand("fontName", v)}>
              <SelectTrigger className="h-7 w-24 text-[11px] bg-white border-none shadow-none focus:ring-0">
                <SelectValue placeholder="Arial" />
              </SelectTrigger>
              <SelectContent>
                {["Arial", "Georgia", "Impact", "Tahoma", "Times New Roman", "Verdana"].map(f => (
                  <SelectItem key={f} value={f} className="text-[11px]">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          <ToolbarButton onClick={() => execCommand("justifyLeft")} icon={<AlignLeft className="h-3.5 w-3.5" />} title="Align Left" />
          <ToolbarButton onClick={() => execCommand("justifyCenter")} icon={<AlignCenter className="h-3.5 w-3.5" />} title="Align Center" />
          <ToolbarButton onClick={() => execCommand("justifyRight")} icon={<AlignRight className="h-3.5 w-3.5" />} title="Align Right" />
          <ToolbarButton onClick={() => execCommand("justifyFull")} icon={<AlignJustify className="h-3.5 w-3.5" />} title="Justify" />

          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          <ToolbarButton onClick={() => execCommand("insertUnorderedList")} icon={<List className="h-3.5 w-3.5" />} title="Bullet List" />
          <ToolbarButton onClick={() => execCommand("insertOrderedList")} icon={<ListOrdered className="h-3.5 w-3.5" />} title="Numbered List" />
          
          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          <Popover open={isImageOpen} onOpenChange={(open) => {
            setIsImageOpen(open);
            if (open) saveSelection();
          }}>
            <PopoverTrigger asChild>
              <ToolbarButton onClick={() => {
                if (onImageUpload) {
                  fileInputRef.current?.click();
                  setIsImageOpen(false);
                }
              }} icon={<ImageIcon className="h-3.5 w-3.5" />} title="Image" />
            </PopoverTrigger>
            {!onImageUpload && (
              <PopoverContent className="w-80 p-3" side="top" align="start">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold">Insert Image URL</span>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="https://example.com/image.jpg" 
                      value={imageUrl} 
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Button size="sm" className="h-8 text-xs" onClick={() => {
                      if (imageUrl) execCommand("insertImage", imageUrl);
                      setImageUrl("");
                      setIsImageOpen(false);
                    }}>Add</Button>
                  </div>
                </div>
              </PopoverContent>
            )}
          </Popover>

          <Popover open={isLinkOpen} onOpenChange={(open) => {
            setIsLinkOpen(open);
            if (open) saveSelection();
          }}>
            <PopoverTrigger asChild>
              <ToolbarButton onClick={() => {}} icon={<LinkIcon className="h-3.5 w-3.5" />} title="Link" />
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" side="top" align="start">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold">Insert Link</span>
                <div className="flex gap-2">
                  <Input 
                    placeholder="https://example.com" 
                    value={linkUrl} 
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={() => {
                    if (linkUrl) execCommand("createLink", linkUrl);
                    setLinkUrl("");
                    setIsLinkOpen(false);
                  }}>Add</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <ToolbarButton onClick={() => execCommand("removeFormat")} icon={<Eraser className="h-3.5 w-3.5" />} title="Clear Format" />
        </div>

        {/* Editor Area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          data-placeholder={placeholder}
          className={cn(
            "p-4 outline-none overflow-y-auto rich-text-content prose prose-sm max-w-none",
            editorClassName
          )}
          style={{ minHeight }}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              document.execCommand("indent");
            }
          }}
        />
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";

const ToolbarButton = ({ onClick, icon, title, ...props }: { onClick: () => void; icon: React.ReactNode; title: string; [key: string]: any }) => (
  <button
    type="button"
    onClick={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-gray-500 hover:text-primary transition-all active:scale-95"
    {...props}
  >
    {icon}
  </button>
);

export default RichTextEditor;
