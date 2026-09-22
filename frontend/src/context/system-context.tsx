"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { climagridApi, runtimeConfig } from "@/lib/api";
import type { SystemCapabilities } from "@/types/climagrid";

interface SystemContextValue {
  capabilities: SystemCapabilities | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SystemContext = createContext<SystemContextValue | null>(null);

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(!runtimeConfig.isDemoMode);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    await Promise.resolve();
    setIsLoading(true);
    setError(null);
    try {
      setCapabilities(await climagridApi.getCapabilities());
    } catch (refreshError) {
      setCapabilities(null);
      setError(refreshError instanceof Error ? refreshError.message : "Backend indisponível.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (runtimeConfig.isDemoMode) return;
    let active = true;
    climagridApi.getCapabilities().then(
      (nextCapabilities) => {
        if (!active) return;
        setCapabilities(nextCapabilities);
        setIsLoading(false);
      },
      (loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Backend indisponível.');
        setIsLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({ capabilities, isLoading, error, refresh }),
    [capabilities, error, isLoading],
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export function useSystemStatus() {
  const context = useContext(SystemContext);
  if (!context) throw new Error("useSystemStatus precisa ser usado dentro de SystemProvider.");
  return context;
}
