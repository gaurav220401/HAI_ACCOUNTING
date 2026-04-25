"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import {
  getServerStatusSnapshot,
  probeServerAvailability,
  subscribeServerStatus,
} from "@/lib/server-status";

const PUBLIC_ROUTE_PREFIXES = ["/login", "/signup"];

function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;

  return PUBLIC_ROUTE_PREFIXES.some(
    (routePrefix) =>
      pathname === routePrefix || pathname.startsWith(`${routePrefix}/`),
  );
}

export function ServerStatusGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { firebaseUser } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string>("");

  const serverStatus = useSyncExternalStore(
    subscribeServerStatus,
    getServerStatusSnapshot,
    getServerStatusSnapshot,
  );

  const showServerDownState = useMemo(() => {
    if (!firebaseUser) return false;
    if (isPublicRoute(pathname)) return false;
    return serverStatus.isServerUnavailable;
  }, [firebaseUser, pathname, serverStatus.isServerUnavailable]);

  const retryConnection = useCallback(async () => {
    setRetrying(true);
    setRetryMessage("");

    try {
      const recovered = await probeServerAvailability();
      if (!recovered) {
        setRetryMessage("Still unavailable. Try again.");
        return;
      }

      setRetryMessage("Connected.");
    } catch {
      setRetryMessage("Try again.");
    } finally {
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    if (!showServerDownState) return;

    const interval = window.setInterval(() => {
      void probeServerAvailability();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [showServerDownState]);

  if (!showServerDownState) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_#cbd5e1_0%,_#f8fafc_45%,_#e2e8f0_100%)]" />

      <div className="relative mx-auto flex min-h-svh w-full max-w-xl items-center justify-center px-4 py-10 sm:px-6">
        <section className="w-full rounded-2xl border border-slate-300 bg-white/95 p-6 text-center shadow-xl backdrop-blur sm:p-8">
          <div className="mx-auto mb-4 w-fit rounded-xl bg-rose-50 p-3 text-rose-600">
              <ServerCrash className="h-6 w-6" />
          </div>

          <h1 className="text-2xl font-semibold text-slate-900">Server unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            We cannot load data right now. Please try again.
          </p>

          <div className="mt-6 flex justify-center">
            <Button onClick={retryConnection} disabled={retrying} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Trying..." : "Try Again"}
            </Button>
          </div>

          {retryMessage ? (
            <p className="mt-3 text-sm text-slate-600">{retryMessage}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
