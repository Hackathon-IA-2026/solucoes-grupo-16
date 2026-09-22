"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { runtimeConfig } from "@/lib/api";
import { workflowSteps } from "@/lib/workflow";
import { useSystemStatus } from "@/context/system-context";

export function Sidebar() {
  const pathname = usePathname();
  const { capabilities, isLoading, error } = useSystemStatus();
  const isConnected = Boolean(capabilities?.backend.available);
  const statusLabel = runtimeConfig.isDemoMode
    ? "Demonstração local"
    : isLoading
      ? "Verificando serviços"
      : isConnected
        ? "Backend conectado"
        : "Backend indisponível";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col justify-between border-r border-outline-variant/50 bg-surface-container-low lg:flex">
      <div>
        <div className="flex h-20 items-center border-b border-outline-variant/40 bg-surface-container-lowest px-5">
          <Image src="/logo.svg" alt="ClimaGrid" width={184} height={46} priority />
        </div>
        <div className="px-4 py-5">
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">Fluxo do estudo</p>
          <nav className="mt-3 space-y-1" aria-label="Etapas do estudo">
          {workflowSteps.map((step, index) => {
            const isActive = step.href === "/" ? pathname === "/" : pathname.startsWith(step.href);
            return (
              <Link
                key={step.href}
                href={step.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
                  isActive
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-white/10" : "bg-surface-container"}`}>
                  <Icon name={step.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{index + 1}. {step.label}</span>
                  <span className={`block truncate text-[11px] ${isActive ? "text-on-primary-container/75" : "text-outline"}`}>{step.description}</span>
                </span>
              </Link>
            );
          })}
          </nav>
        </div>
      </div>
      <div className="m-4 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
          <span className={`h-2 w-2 rounded-full ${runtimeConfig.isDemoMode || !isConnected ? "bg-amber-300" : "bg-emerald-300"}`} />
          {statusLabel}
        </div>
        <p className="mt-2 text-[11px] leading-4 text-outline">
          {runtimeConfig.isDemoMode
            ? "Os valores exibidos são fictícios e servem apenas para validar o fluxo do frontend."
            : error
              ? error
              : capabilities?.aiService.available
                ? "NestJS e serviço de IA responderam."
                : "NestJS respondeu; o serviço de IA está indisponível."}
        </p>
      </div>
    </aside>
  );
}
