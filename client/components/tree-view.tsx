"use client";

import * as React from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  Plus,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

export interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  isGroup: boolean;
  children?: TreeNode[];
  data?: Record<string, unknown>;
}

interface TreeViewProps {
  /** Flat or nested node array */
  nodes: TreeNode[];
  /** Called when a node is selected */
  onSelect?: (node: TreeNode) => void;
  /** Currently selected node ID */
  selectedId?: string;
  /** Called when "Add child" is clicked on a group */
  onAddChild?: (parentNode: TreeNode) => void;
  /** Called when "Edit" is clicked */
  onEdit?: (node: TreeNode) => void;
  /** Called when "Delete" is clicked */
  onDelete?: (node: TreeNode) => void;
  /** Render extra info alongside the name */
  renderExtra?: (node: TreeNode) => React.ReactNode;
  /** Default expanded node IDs */
  defaultExpanded?: string[];
  /** Indent size in pixels per level */
  indentSize?: number;
}

// ─── Helper: Build tree from flat array ─────────────────────────────────

export function buildTree(flatNodes: TreeNode[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Clone nodes and init children
  for (const node of flatNodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ─── TreeNodeRow ────────────────────────────────────────────────────────

interface TreeNodeRowProps {
  node: TreeNode;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect?: (node: TreeNode) => void;
  onAddChild?: (node: TreeNode) => void;
  onEdit?: (node: TreeNode) => void;
  onDelete?: (node: TreeNode) => void;
  renderExtra?: (node: TreeNode) => React.ReactNode;
  indentSize: number;
}

function TreeNodeRow({
  node,
  level,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  onAddChild,
  onEdit,
  onDelete,
  renderExtra,
  indentSize,
}: TreeNodeRowProps) {
  const hasActions = onAddChild || onEdit || onDelete;

  return (
    <div
      className={cn(
        "group flex items-center gap-1 py-1.5 px-2 rounded-md text-sm hover:bg-muted/50 cursor-pointer transition-colors",
        isSelected && "bg-muted",
      )}
      style={{ paddingLeft: `${level * indentSize + 8}px` }}
      onClick={() => {
        if (node.isGroup) onToggle();
        onSelect?.(node);
      }}
    >
      {/* Expand/collapse icon */}
      {node.isGroup ?
        <span className="shrink-0 w-4 h-4 flex items-center justify-center">
          {isExpanded ?
            <ChevronDown className="h-3.5 w-3.5" />
          : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      : <span className="shrink-0 w-4" />}

      {/* Icon */}
      {node.isGroup ?
        <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
      : <File className="h-4 w-4 text-muted-foreground shrink-0" />}

      {/* Name */}
      <span className="truncate flex-1 font-medium">{node.name}</span>

      {/* Extra info (e.g., balance) */}
      {renderExtra && (
        <span className="text-muted-foreground text-xs shrink-0">
          {renderExtra(node)}
        </span>
      )}

      {/* Actions */}
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {node.isGroup && onAddChild && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild(node);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                Add Child
              </DropdownMenuItem>
            )}
            {onEdit && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(node);
                }}
              >
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node);
                }}
              >
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ─── Main TreeView ──────────────────────────────────────────────────────

export function TreeView({
  nodes,
  onSelect,
  selectedId,
  onAddChild,
  onEdit,
  onDelete,
  renderExtra,
  defaultExpanded = [],
  indentSize = 20,
}: TreeViewProps) {
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    new Set(defaultExpanded),
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNodes = (nodeList: TreeNode[], level: number) => {
    return nodeList.map((node) => {
      const isExpanded = expandedIds.has(node.id);
      return (
        <React.Fragment key={node.id}>
          <TreeNodeRow
            node={node}
            level={level}
            isExpanded={isExpanded}
            isSelected={selectedId === node.id}
            onToggle={() => toggleExpand(node.id)}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onEdit={onEdit}
            onDelete={onDelete}
            renderExtra={renderExtra}
            indentSize={indentSize}
          />
          {isExpanded &&
            node.children &&
            node.children.length > 0 &&
            renderNodes(node.children, level + 1)}
        </React.Fragment>
      );
    });
  };

  // If nodes are flat (have parentId), build tree first
  const treeNodes = React.useMemo(() => {
    if (nodes.length > 0 && nodes.some((n) => n.parentId !== undefined)) {
      // Check if already nested (has children populated)
      const alreadyNested = nodes.some(
        (n) => n.children && n.children.length > 0,
      );
      if (alreadyNested) return nodes;
      return buildTree(nodes);
    }
    return nodes;
  }, [nodes]);

  return (
    <div className="space-y-0.5">
      {treeNodes.length === 0 ?
        <div className="text-center py-8 text-muted-foreground text-sm">
          No items found
        </div>
      : renderNodes(treeNodes, 0)}
    </div>
  );
}
