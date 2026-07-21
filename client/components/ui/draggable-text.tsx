"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * DraggableText – horizontal drag-to-scroll for overflowing text.
 *
 * Two modes:
 *  • Default (alwaysActive=false): requires a double-click to "activate" before
 *    dragging starts. Good for sidebar panels where row clicks don't conflict.
 *
 *  • Table mode (alwaysActive=true): drag starts on the very first mousedown –
 *    no double-click required, just like Excel. If the pointer barely moves
 *    (< 4 px) the click propagates normally so the parent <TableRow> still
 *    navigates / selects. If the pointer dragged further, the click is
 *    suppressed so the row action does NOT fire.
 */
export function DraggableText({
  children,
  className,
  title,
  disabled = false,
  alwaysActive = false,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
  /** Enable single-mousedown drag (table / Excel mode). No double-click needed. */
  alwaysActive?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [isActivated, setIsActivated] = React.useState(false);
  const isMouseDown = React.useRef(false);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const startScrollLeft = React.useRef(0);

  // Global window mousemove and mouseup listeners for buttery smooth dragging
  React.useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isMouseDown.current || !ref.current) return;
      const dx = e.clientX - startX.current;
      if (Math.abs(dx) > 3) {
        isDragging.current = true;
      }
      if (isDragging.current) {
        ref.current.scrollLeft = startScrollLeft.current - dx;
        // Prevent text selection while dragging
        e.preventDefault();
      }
    };

    const handleWindowMouseUp = () => {
      if (isMouseDown.current) {
        isMouseDown.current = false;
        if (isDragging.current) {
          setTimeout(() => {
            isDragging.current = false;
          }, 50);
        }
      }
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, []);

  // Deactivate when clicking outside the active element (non-alwaysActive mode)
  React.useEffect(() => {
    if (!isActivated || alwaysActive) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsActivated(false);
      }
    };

    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleOutsideClick);
    }, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isActivated, alwaysActive]);

  if (disabled) {
    return <>{children}</>;
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (alwaysActive) return; // no-op; drag already works on mousedown
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='checkbox'], [role='button'], .no-drag")) {
      return;
    }
    e.stopPropagation();
    setIsActivated(true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='checkbox'], [role='button'], .no-drag")) {
      return;
    }

    if (alwaysActive) {
      // Table / Excel mode: always start tracking on mousedown
      if (!ref.current) return;
      isMouseDown.current = true;
      isDragging.current = false;
      startX.current = e.clientX;
      startScrollLeft.current = ref.current.scrollLeft;
      return;
    }

    const isDouble = e.detail >= 2;
    if (isDouble) {
      setIsActivated(true);
    }

    if (!isActivated && !isDouble) {
      return;
    }

    if (!ref.current) return;
    isMouseDown.current = true;
    isDragging.current = false;
    startX.current = e.clientX;
    startScrollLeft.current = ref.current.scrollLeft;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const resolvedTitle = typeof children === "string" ? children : title;

  if (alwaysActive) {
    return (
      <div
        ref={ref}
        onMouseDown={handleMouseDown}
        onClickCapture={handleClick}
        title={resolvedTitle}
        className={cn(
          "w-full overflow-x-auto no-scrollbar whitespace-nowrap align-middle select-none block min-w-0 max-w-full cursor-grab active:cursor-grabbing",
          className
        )}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onClickCapture={handleClick}
      title={
        isActivated
          ? (resolvedTitle || "Drag left/right to scroll")
          : `${resolvedTitle ? resolvedTitle + " • " : ""}Double-click to enable drag scroll`
      }
      className={cn(
        "w-full overflow-x-auto no-scrollbar whitespace-nowrap align-middle select-none block min-w-0 max-w-full transition-all duration-150",
        isActivated
          ? "cursor-grab active:cursor-grabbing ring-1 ring-teal-500/50 rounded-xs bg-teal-500/5 px-0.5"
          : "cursor-default",
        className
      )}
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {children}
    </div>
  );
}
