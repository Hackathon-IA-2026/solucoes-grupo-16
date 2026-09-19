"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { runtimeConfig } from "@/lib/api";
import { workflowSteps } from "@/lib/workflow";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-sidebar-bg lg:flex">
      {/* Logo — sem borda direita, alinha com o topbar */}
      <div className="flex h-28 shrink-0 items-center border-b border-neutral-900/40 bg-card-bg px-5">
        <Image src="/logo.svg" alt="ClimaGrid" width={384} height={246} priority />
      </div>
      {/* Conteúdo abaixo — com borda direita */}
      <div className="flex flex-1 flex-col justify-between border-r border-neutral-900/50">
        <div className="px-4 pt-7 pb-5">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Fluxo do estudo</p>
          <nav className="mt-3 space-y-1" aria-label="Etapas do estudo">
            {workflowSteps.map((step, index) => {
              const isActive = step.href === "/" ? pathname === "/" : pathname.startsWith(step.href);
              return (
                <Link
                  key={step.href}
                  href={step.href}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors ${isActive
                    ? "bg-accent-blue text-white"
                    : "text-text-secondary hover:bg-neutral-800 hover:text-text-primary"
                    }`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-white/10" : "bg-neutral-900"}`}>
                    <Icon name={step.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{index + 1}. {step.label}</span>
                    <span className={`block truncate text-[11px] ${isActive ? "text-white/75" : "text-text-muted"}`}>{step.description}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="m-4 rounded-2xl border border-neutral-900/50 bg-card-bg p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <span className={`h-2 w-2 rounded-full ${runtimeConfig.isDemoMode ? "bg-amber-300" : "bg-emerald-300"}`} />
            {runtimeConfig.isDemoMode ? "Demonstração local" : "API configurada"}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-text-muted">
            {runtimeConfig.isDemoMode
              ? "Os valores exibidos são fictícios e servem apenas para validar o fluxo do frontend."
              : "Dados e arquivos serão solicitados ao backend configurado."}
          </p>
        </div>
      </div>
    </aside>
  );
}
