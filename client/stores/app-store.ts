import { create } from "zustand";

// ─── App Store ─────────────────────────────────────────────────────────
// Global UI state: sidebar, active company, preferences

interface Company {
  id: string;
  name: string;
  abbr: string;
  defaultCurrency: string;
}

interface AppState {
  // Active company
  activeCompany: Company | null;
  setActiveCompany: (company: Company | null) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Global filters (for reports, dashboards)
  globalFilters: {
    dateRange?: { from: Date; to: Date };
    fiscalYear?: string;
  };
  setGlobalFilters: (filters: Partial<AppState["globalFilters"]>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Active company
  activeCompany: null,
  setActiveCompany: (company) => set({ activeCompany: company }),

  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Global filters
  globalFilters: {},
  setGlobalFilters: (filters) =>
    set((s) => ({ globalFilters: { ...s.globalFilters, ...filters } })),
}));
