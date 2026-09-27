"use client";

import { WorkflowStepper } from "./workflow-stepper";
import { SystemStatus } from "./system-status";
import { BrandLogo } from "./brand-logo";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-outline-variant/50 bg-surface/95 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="lg:hidden"><BrandLogo compact /></div>
        <div className="hidden items-center gap-2 text-sm text-on-surface-variant lg:flex">
          <span className="font-medium text-on-surface">Subsistema Nordeste</span>
          <span aria-hidden="true">·</span>
          <span>MVP eólico</span>
        </div>
        <SystemStatus />
      </div>
      <WorkflowStepper />
    </header>
  );
}
