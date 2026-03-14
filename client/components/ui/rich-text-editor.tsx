"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { 
  Bold, Italic, Underline, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, Type,
  Eraser, Link as LinkIcon
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
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
  ({ value, onChange, placeholder, className, toolbarClassName, editorClassName, minHeight = "150px" }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);

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
      document.execCommand(command, false, value);
      editorRef.current?.focus();
    };

    return (
      <div className={cn("flex flex-col border rounded-md overflow-hidden bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all", className)}>
        {/* Toolbar */}
        <div className={cn("flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-gray-50/50", toolbarClassName)}>
          <ToolbarButton onClick={() => execCommand("bold")} icon={<Bold className="h-3.5 w-3.5" />} title="Bold" />
          <ToolbarButton onClick={() => execCommand("italic")} icon={<Italic className="h-3.5 w-3.5" />} title="Italic" />
          <ToolbarButton onClick={() => execCommand("underline")} icon={<Underline className="h-3.5 w-3.5" />} title="Underline" />
          
          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          <ToolbarButton onClick={() => execCommand("insertUnorderedList")} icon={<List className="h-3.5 w-3.5" />} title="Bullet List" />
          <ToolbarButton onClick={() => execCommand("insertOrderedList")} icon={<ListOrdered className="h-3.5 w-3.5" />} title="Numbered List" />
          
          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          <ToolbarButton onClick={() => execCommand("justifyLeft")} icon={<AlignLeft className="h-3.5 w-3.5" />} title="Align Left" />
          <ToolbarButton onClick={() => execCommand("justifyCenter")} icon={<AlignCenter className="h-3.5 w-3.5" />} title="Align Center" />
          <ToolbarButton onClick={() => execCommand("justifyRight")} icon={<AlignRight className="h-3.5 w-3.5" />} title="Align Right" />
          
          <div className="w-px h-4 bg-gray-300 mx-1" />
          
          <ToolbarButton onClick={() => {
            const url = prompt("Enter link URL:");
            if (url) execCommand("createLink", url);
          }} icon={<LinkIcon className="h-3.5 w-3.5" />} title="Link" />
          
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

const ToolbarButton = ({ onClick, icon, title }: { onClick: () => void; icon: React.ReactNode; title: string }) => (
  <button
    type="button"
    onClick={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm text-gray-500 hover:text-primary transition-all active:scale-95"
  >
    {icon}
  </button>
);

export default RichTextEditor;
