"use client";

import Image from "next/image";
import { runtimeConfig } from "@/lib/api";
import { WorkflowStepper } from "./workflow-stepper";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-outline-variant/50 bg-surface/95 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Image className="lg:hidden" src="/logo.svg" alt="ClimaGrid" width={150} height={38} priority />
        <div className="hidden items-center gap-2 text-sm text-on-surface-variant lg:flex">
          <span className="font-medium text-on-surface">Subsistema Nordeste</span>
          <span aria-hidden="true">·</span>
          <span>MVP eólico</span>
        </div>
        <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${runtimeConfig.isDemoMode ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"}`}>
          {runtimeConfig.isDemoMode ? "Modo demonstração" : "Backend conectado"}
        </div>
      </div>
      <WorkflowStepper />
    </header>
  );
}
