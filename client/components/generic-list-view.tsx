"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Plus,
  Download,
} from "lucide-react";

// ─── Column Definition ─────────────────────────────────────────────────

export interface ColumnDef<T> {
  /** Unique key for the column */
  key: string;
  /** Display header text */
  header: string;
  /** Accessor function to get value from row */
  accessor?: (row: T) => React.ReactNode;
  /** Field name for sorting (if sortable) */
  sortKey?: string;
  /** Whether this column is sortable */
  sortable?: boolean;
  /** Column width */
  width?: string;
  /** Text alignment */
  align?: "left" | "center" | "right";
  /** Custom cell renderer */
  cell?: (row: T) => React.ReactNode;
}

// ─── Props ──────────────────────────────────────────────────────────────

interface GenericListViewProps<T> {
  /** Data to display */
  data: T[];
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Total count for pagination */
  totalCount?: number;
  /** Current page (1-indexed) */
  page?: number;
  /** Items per page */
  pageSize?: number;
  /** Called when page changes */
  onPageChange?: (page: number) => void;
  /** Called when page size changes */
  onPageSizeChange?: (size: number) => void;
  /** Current sort key */
  sortBy?: string;
  /** Current sort direction */
  sortOrder?: "asc" | "desc";
  /** Called when sort changes */
  onSortChange?: (key: string, order: "asc" | "desc") => void;
  /** Search value */
  searchValue?: string;
  /** Called when search changes */
  onSearchChange?: (value: string) => void;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Called when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Row key accessor */
  rowKey: (row: T) => string;
  /** Title for the list view */
  title?: string;
  /** Called when "New" button is clicked */
  onNew?: () => void;
  /** Label for new button */
  newLabel?: string;
  /** Called when export is clicked */
  onExport?: () => void;
  /** Extra action buttons */
  actions?: React.ReactNode;
  /** Empty state message */
  emptyMessage?: string;
}

// ─── Component ──────────────────────────────────────────────────────────

export function GenericListView<T>({
  data,
  columns,
  isLoading,
  totalCount = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder = "desc",
  onSortChange,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  onRowClick,
  rowKey,
  title,
  onNew,
  newLabel = "New",
  onExport,
  actions,
  emptyMessage = "No data found",
}: GenericListViewProps<T>) {
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    if (sortBy === key) {
      onSortChange(key, sortOrder === "asc" ? "desc" : "asc");
    } else {
      onSortChange(key, "asc");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          {title && (
            <h2 className="text-lg font-semibold whitespace-nowrap">{title}</h2>
          )}
          {onSearchChange && (
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          )}
          {onNew && (
            <Button size="sm" onClick={onNew}>
              <Plus className="h-4 w-4 mr-1" />
              {newLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  style={{ width: col.width }}
                  className={`${
                    col.align === "right" ? "text-right"
                    : col.align === "center" ? "text-center"
                    : ""
                  } ${col.sortable ? "cursor-pointer select-none" : ""}`}
                  onClick={() =>
                    col.sortable && col.sortKey && handleSort(col.sortKey)
                  }
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortBy === col.sortKey && (
                      <span className="text-xs">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ?
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : data.length === 0 ?
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center py-10 text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            : data.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className={
                    onRowClick ? "cursor-pointer hover:bg-muted/50" : ""
                  }
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={
                        col.align === "right" ? "text-right"
                        : col.align === "center" ?
                          "text-center"
                        : ""
                      }
                    >
                      {col.cell ?
                        col.cell(row)
                      : col.accessor ?
                        col.accessor(row)
                      : ((row as Record<string, unknown>)[
                          col.key
                        ]?.toString() ?? "")
                      }
                    </TableCell>
                  ))}
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{" "}
            {Math.min(page * pageSize, totalCount)} of {totalCount} results
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange?.(Number(v))}
            >
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => onPageChange?.(1)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => onPageChange?.(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                {page} / {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => onPageChange?.(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => onPageChange?.(totalPages)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
