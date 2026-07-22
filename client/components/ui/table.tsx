import * as React from "react"
import { cn } from "@/lib/utils"
import { DraggableText } from "@/components/ui/draggable-text"
export { DraggableText, DraggableText as DraggableCellText }



function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto no-scrollbar"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm border-collapse table-fixed", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last-child:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  children,
  style,
  resizable = true,
  ...props
}: React.ComponentProps<"th"> & { resizable?: boolean }) {
  const thRef = React.useRef<HTMLTableCellElement>(null);
  const isResizing = React.useRef(false);
  const startX = React.useRef(0);
  const startWidth = React.useRef(0);
  const [colWidth, setColWidth] = React.useState<number | undefined>(undefined);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!thRef.current) return;
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = thRef.current.offsetWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const dx = moveEvent.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + dx);
      setColWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setColWidth(undefined);
  };

  return (
    <th
      ref={thRef}
      data-slot="table-head"
      style={{ ...style, width: colWidth ?? style?.width }}
      className={cn(
        "relative h-10 px-3 text-left align-middle font-medium text-muted-foreground select-none overflow-hidden group/th [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between w-full h-full min-w-0">
        <DraggableText className="font-inherit text-inherit min-w-0">
          {children}
        </DraggableText>
        {resizable && (
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            title="Drag to resize column, double-click to auto-fit"
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-teal-500/50 group-hover/th:bg-slate-300/60 z-20"
          />
        )}
      </div>
    </th>
  )
}

function TableCell({
  className,
  children,
  disableDrag = false,
  style,
  ...props
}: React.ComponentProps<"td"> & { disableDrag?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      style={style}
      className={cn(
        "p-3 align-middle whitespace-nowrap overflow-hidden max-w-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    >
      <DraggableText disabled={disableDrag}>
        {children}
      </DraggableText>
    </td>
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
