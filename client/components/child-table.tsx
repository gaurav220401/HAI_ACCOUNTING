"use client";

import * as React from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ChildTableColumn<T> {
  /** Key in the row data */
  key: keyof T & string;
  /** Header label */
  label: string;
  /** Column width (CSS value, e.g. "200px", "30%") */
  width?: string;
  /** Column type determines which input to render */
  type?: "text" | "number" | "currency" | "select" | "readonly";
  /** Required field */
  required?: boolean;
  /** Select options (for type="select") */
  options?: { label: string; value: string }[];
  /** Custom cell renderer (for complex cells like LinkField, etc.) */
  renderCell?: (
    value: unknown,
    row: T,
    rowIndex: number,
    onChange: (key: keyof T & string, value: unknown) => void,
  ) => React.ReactNode;
  /** Custom read-only renderer */
  renderDisplay?: (value: unknown, row: T) => React.ReactNode;
}

interface ChildTableProps<T extends Record<string, unknown>> {
  /** Column definitions */
  columns: ChildTableColumn<T>[];
  /** Current rows */
  rows: T[];
  /** Called when rows change */
  onChange: (rows: T[]) => void;
  /** Factory to create a new empty row */
  createRow: () => T;
  /** Max number of rows allowed */
  maxRows?: number;
  /** Whether the table is read-only */
  readOnly?: boolean;
  /** Whether to show row numbers */
  showRowNumbers?: boolean;
  /** Whether to allow reordering */
  allowReorder?: boolean;
  /** Custom class for the container */
  className?: string;
}

// ─── ChildTable ─────────────────────────────────────────────────────────

export function ChildTable<T extends Record<string, unknown>>({
  columns,
  rows,
  onChange,
  createRow,
  maxRows,
  readOnly = false,
  showRowNumbers = true,
  allowReorder = false,
  className,
}: ChildTableProps<T>) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  const addRow = () => {
    if (maxRows && rows.length >= maxRows) return;
    onChange([...rows, createRow()]);
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const updateCell = (
    rowIndex: number,
    key: keyof T & string,
    value: unknown,
  ) => {
    const updated = rows.map((row, i) =>
      i === rowIndex ? { ...row, [key]: value } : row,
    );
    onChange(updated);
  };

  // ─── Drag & Drop ────────────────────────────────────────────────

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...rows];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    onChange(updated);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // ─── Cell Renderer ──────────────────────────────────────────────

  const renderCellInput = (
    col: ChildTableColumn<T>,
    row: T,
    rowIndex: number,
  ) => {
    const value = row[col.key];

    if (readOnly || col.type === "readonly") {
      if (col.renderDisplay) return col.renderDisplay(value, row);
      return (
        <span className="text-sm px-2">
          {value !== null && value !== undefined ? String(value) : "—"}
        </span>
      );
    }

    // Custom renderer
    if (col.renderCell) {
      return col.renderCell(value, row, rowIndex, (key, val) =>
        updateCell(rowIndex, key, val),
      );
    }

    switch (col.type) {
      case "number":
      case "currency":
        return (
          <Input
            type="number"
            value={value !== undefined && value !== null ? String(value) : ""}
            onChange={(e) =>
              updateCell(
                rowIndex,
                col.key,
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className={cn(
              "h-8 text-sm border-0 shadow-none focus-visible:ring-1",
              col.type === "currency" && "text-right",
            )}
            step={col.type === "currency" ? "0.01" : undefined}
            required={col.required}
          />
        );

      case "select":
        return (
          <select
            value={value !== undefined && value !== null ? String(value) : ""}
            onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
            className="h-8 w-full rounded-md bg-transparent text-sm px-2 border-0 focus:ring-1 focus:ring-ring"
          >
            <option value="">Select...</option>
            {col.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      default:
        return (
          <Input
            type="text"
            value={value !== undefined && value !== null ? String(value) : ""}
            onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
            className="h-8 text-sm border-0 shadow-none focus-visible:ring-1"
            required={col.required}
          />
        );
    }
  };

  return (
    <div className={cn("border rounded-lg", className)}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {allowReorder && !readOnly && <TableHead className="w-8" />}
              {showRowNumbers && (
                <TableHead className="w-12 text-center">#</TableHead>
              )}
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    col.type === "currency" && "text-right",
                    col.required &&
                      "after:content-['*'] after:text-destructive after:ml-0.5",
                  )}
                >
                  {col.label}
                </TableHead>
              ))}
              {!readOnly && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={
                    columns.length +
                    (showRowNumbers ? 1 : 0) +
                    (allowReorder && !readOnly ? 1 : 0) +
                    (!readOnly ? 1 : 0)
                  }
                  className="text-center text-muted-foreground py-6"
                >
                  No rows added.{" "}
                  {!readOnly && (
                    <button
                      onClick={addRow}
                      className="text-primary underline hover:no-underline"
                    >
                      Add a row
                    </button>
                  )}
                </TableCell>
              </TableRow>
            : rows.map((row, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  className={cn(
                    dragOverIndex === rowIndex &&
                      dragIndex !== rowIndex &&
                      "border-t-2 border-primary",
                    dragIndex === rowIndex && "opacity-50",
                  )}
                  draggable={allowReorder && !readOnly}
                  onDragStart={() => handleDragStart(rowIndex)}
                  onDragOver={(e) => handleDragOver(e, rowIndex)}
                  onDrop={() => handleDrop(rowIndex)}
                  onDragEnd={handleDragEnd}
                >
                  {allowReorder && !readOnly && (
                    <TableCell className="w-8 cursor-grab active:cursor-grabbing">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  )}
                  {showRowNumbers && (
                    <TableCell className="text-center text-muted-foreground text-xs">
                      {rowIndex + 1}
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell key={col.key} className="py-1 px-1">
                      {renderCellInput(col, row, rowIndex)}
                    </TableCell>
                  ))}
                  {!readOnly && (
                    <TableCell className="py-1 px-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(rowIndex)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>

      {/* Add row button */}
      {!readOnly && (
        <div className="border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            disabled={maxRows !== undefined && rows.length >= maxRows}
            className="text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Row
            {maxRows && (
              <span className="ml-1 text-muted-foreground">
                ({rows.length}/{maxRows})
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
