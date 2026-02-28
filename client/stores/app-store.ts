import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── App Store ─────────────────────────────────────────────────────────
// Global UI state: sidebar, active organization, preferences

interface ActiveOrganization {
  id: string;
  name: string;
  baseCurrency: string;
  country: string;
  timezone: string;
  fiscalYearStart: number; // 1-12
}

interface AppState {
  // Active organization (Zoho Books: one org = one workspace)
  activeOrganization: ActiveOrganization | null;
  setActiveOrganization: (org: ActiveOrganization | null) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Global filters (for reports, dashboards)
  globalFilters: {
    dateRange?: { from: Date; to: Date };
    fiscalYear?: string;
    currency?: string;
  };
  setGlobalFilters: (filters: Partial<AppState["globalFilters"]>) => void;
  clearGlobalFilters: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Active organization
      activeOrganization: null,
      setActiveOrganization: (org) => set({ activeOrganization: org }),

      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Global filters
      globalFilters: {},
      setGlobalFilters: (filters) =>
        set((s) => ({ globalFilters: { ...s.globalFilters, ...filters } })),
      clearGlobalFilters: () => set({ globalFilters: {} }),
    }),
    {
      name: "hai-app-store",
      // Only persist the active org and sidebar state
      partialize: (state) => ({
        activeOrganization: state.activeOrganization,
        sidebarOpen: state.sidebarOpen,
      }),
    },
  ),
);
