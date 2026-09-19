"use client";

import Image from "next/image";
import { runtimeConfig } from "@/lib/api";
import { WorkflowStepper } from "./workflow-stepper";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-900/50 bg-page-bg/95 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Image className="lg:hidden" src="/logo.svg" alt="ClimaGrid" width={150} height={38} priority />
        <div className="hidden items-center gap-2 text-sm text-text-secondary lg:flex">
          <span className="font-medium text-text-primary">Subsistema Nordeste</span>
          <span aria-hidden="true">·</span>
          <span>MVP eólico</span>
        </div>
        <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${runtimeConfig.isDemoMode ? "border-amber-300/30 bg-yellow-500/10 text-yellow-500" : "border-emerald-300/30 bg-paid/10 text-paid"}`}>
          {runtimeConfig.isDemoMode ? "Modo demonstração" : "Backend conectado"}
        </div>
      </div>
      <WorkflowStepper />
    </header>
  );
}
