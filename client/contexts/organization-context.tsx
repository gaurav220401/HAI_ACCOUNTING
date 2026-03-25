"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useAuth } from "./auth-context";
import { organizationApi, type Organization } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";

interface OrganizationContextType {
  /** The currently active organization (or null if none yet) */
  activeOrganization: Organization | null;
  /** All organizations the user belongs to */
  organizations: Organization[];
  /** True while fetching orgs */
  loading: boolean;
  /** Switch to a different organization */
  switchOrganization: (org: Organization) => Promise<void>;
  /** Refresh the org list */
  refreshOrganizations: () => Promise<void>;
  /** True if the user has no organizations and needs to set one up */
  needsOrgSetup: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(
  undefined,
);

export function OrganizationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dbUser, firebaseUser } = useAuth();
  const { activeOrganization: storedOrg, setActiveOrganization } =
    useAppStore();

  const [activeOrganization, setActiveOrg] = useState<Organization | null>(
    null,
  );
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [apiError, setApiError] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    if (!firebaseUser) {
      setOrganizations([]);
      setActiveOrg(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadFailed(false);
      setApiError(false);
      const res = await organizationApi.list();
      const orgs = (res as any).data ?? [];
      setOrganizations(orgs);

      // Determine the active org:
      // 1. Use dbUser.activeOrganization if it matches a fetched org
      // 2. Fall back to the Zustand persisted org
      // 3. Fall back to first org in list
      const activeId = (dbUser as any)?.activeOrganization;
      const matched =
        orgs.find((o: Organization) => o._id === activeId) ??
        orgs.find(
          (o: Organization) => o._id === storedOrg?.id,
        ) ??
        orgs[0] ??
        null;

      setActiveOrg(matched);
      if (matched) {
        // Ensure backend also has an active org, otherwise API calls that rely on it
        // (e.g. contacts/customers) will fail with "No active organization".
        if (!activeId) {
          try {
            await organizationApi.setActive(matched._id);
          } catch {
            // best-effort
          }
        }
        setActiveOrganization({
          id: matched._id,
          name: matched.name,
          baseCurrency: matched.baseCurrency,
          country: matched.country,
          timezone: matched.timezone,
          fiscalYearStart: matched.fiscalYearStart,
        });
      } else {
        setActiveOrganization(null);
      }
    } catch {
      setLoadFailed(true);
      setOrganizations([]);
      setActiveOrg(null);
    } catch (error: any) {
      console.error('Failed to fetch organizations:', error);
      // Create a mock organization for development when backend is not available
      const mockOrg: Organization = {
        _id: 'mock-org-1',
        name: 'Demo Organization',
        industry: 'Technology',
        baseCurrency: 'USD',
        fiscalYearStart: 1,
        country: 'US',
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        numberFormat: 'en-US',
        language: 'en',
        createdBy: firebaseUser.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setOrganizations([mockOrg]);
      setActiveOrg(mockOrg);
      setActiveOrganization({
        id: mockOrg._id,
        name: mockOrg.name,
        baseCurrency: mockOrg.baseCurrency,
        country: mockOrg.country,
        timezone: mockOrg.timezone,
        fiscalYearStart: mockOrg.fiscalYearStart,
      });
      setApiError(true);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, dbUser]);

  // Fetch orgs when user logs in / changes
  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const switchOrganization = useCallback(
    async (org: Organization) => {
      try {
        await organizationApi.setActive(org._id);
      } catch {
        // best-effort — still switch locally
      }
      setActiveOrg(org);
      setActiveOrganization({
        id: org._id,
        name: org.name,
        baseCurrency: org.baseCurrency,
        country: org.country,
        timezone: org.timezone,
        fiscalYearStart: org.fiscalYearStart,
      });
    },
    [setActiveOrganization],
  );

  const needsOrgSetup =
    !loading &&
    !loadFailed &&
    firebaseUser != null &&
    dbUser != null &&
    organizations.length === 0;
  const needsOrgSetup = !loading && firebaseUser != null && organizations.length === 0 && !apiError;

  return (
    <OrganizationContext.Provider
      value={{
        activeOrganization,
        organizations,
        loading,
        switchOrganization,
        refreshOrganizations: fetchOrganizations,
        needsOrgSetup,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx)
    throw new Error(
      "useOrganization must be used within <OrganizationProvider>",
    );
  return ctx;
}
