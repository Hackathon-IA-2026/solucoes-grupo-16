"use client";

import { ScenarioProvider } from "@/context/scenario-context";
import { SystemProvider } from "@/context/system-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SystemProvider><ScenarioProvider>{children}</ScenarioProvider></SystemProvider>;
}
