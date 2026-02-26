"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

export interface LinkFieldOption {
  value: string;
  label: string;
  description?: string;
}

interface LinkFieldProps {
  /** Currently selected value */
  value: string;
  /** Called when value changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Async function to fetch options based on search query */
  fetchOptions: (query: string) => Promise<LinkFieldOption[]>;
  /** Static options (if provided, fetchOptions is ignored) */
  staticOptions?: LinkFieldOption[];
  /** Debounce delay for search in ms */
  debounceMs?: number;
  /** Minimum characters before searching */
  minChars?: number;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether the field value can be cleared */
  clearable?: boolean;
  /** Label for display when no fetchOptions is available */
  displayLabel?: string;
  /** Additional CSS classes */
  className?: string;
}

// ─── Hook: useDebounce ──────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ─── LinkField ──────────────────────────────────────────────────────────

export function LinkField({
  value,
  onChange,
  placeholder = "Select...",
  fetchOptions,
  staticOptions,
  debounceMs = 300,
  minChars = 0,
  disabled = false,
  clearable = true,
  displayLabel,
  className,
}: LinkFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [options, setOptions] = React.useState<LinkFieldOption[]>(
    staticOptions ?? [],
  );
  const [isLoading, setIsLoading] = React.useState(false);

  const debouncedSearch = useDebounce(search, debounceMs);

  // Fetch options when search changes (async mode)
  React.useEffect(() => {
    if (staticOptions) return;
    if (debouncedSearch.length < minChars) {
      setOptions([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchOptions(debouncedSearch)
      .then((result) => {
        if (!cancelled) {
          setOptions(result);
        }
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, fetchOptions, staticOptions, minChars]);

  // Load initial options on open (for async mode)
  React.useEffect(() => {
    if (!open || staticOptions) return;
    if (options.length === 0 && minChars === 0) {
      setIsLoading(true);
      fetchOptions("")
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setIsLoading(false));
    }
  }, [open, staticOptions, fetchOptions, minChars, options.length]);

  // Filter static options locally
  const filteredOptions = React.useMemo(() => {
    if (!staticOptions) return options;
    if (!search) return staticOptions;
    const lower = search.toLowerCase();
    return staticOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        opt.value.toLowerCase().includes(lower) ||
        opt.description?.toLowerCase().includes(lower),
    );
  }, [staticOptions, options, search]);

  // Find selected option label
  const selectedLabel = React.useMemo(() => {
    if (displayLabel && value) return displayLabel;
    const allOpts = staticOptions ?? options;
    const found = allOpts.find((opt) => opt.value === value);
    return found?.label ?? value;
  }, [value, options, staticOptions, displayLabel]);

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <span className="truncate">
              {value ? selectedLabel : placeholder}
            </span>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {clearable && value && !disabled && (
                <X
                  className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                  }}
                />
              )}
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search${minChars > 0 ? ` (min ${minChars} chars)` : ""}...`}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {isLoading ?
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading...
                  </span>
                </div>
              : <>
                  <CommandEmpty>
                    {search.length < minChars ?
                      `Type at least ${minChars} character${minChars > 1 ? "s" : ""} to search`
                    : "No results found"}
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredOptions.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          onChange(option.value === value ? "" : option.value);
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === option.value ?
                              "opacity-100"
                            : "opacity-0",
                          )}
                        />
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          {option.description && (
                            <span className="text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              }
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
