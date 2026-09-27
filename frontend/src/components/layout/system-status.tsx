"use client";

import { Icon } from "@/components/ui/icon";
import { useSystemStatus } from "@/context/system-context";
import { runtimeConfig } from "@/lib/api";

export function SystemStatus() {
  const { capabilities, isLoading, error, refresh } = useSystemStatus();
  const backendConnected = Boolean(capabilities?.backend.available);
  const aiConnected = Boolean(capabilities?.aiService.available);

  return (
    <details className="group relative">
      <summary aria-label={`Status dos serviços: backend ${backendConnected ? "conectado" : "desconectado"}; IA ${aiConnected ? "conectada" : "desconectada"}`} className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-outline-variant/50 bg-surface-container-lowest/80 px-2.5 py-2 shadow-lg shadow-black/10 transition hover:border-outline hover:bg-surface-container [&::-webkit-details-marker]:hidden">
        <ServiceIcon name="cloud" connected={backendConnected} loading={isLoading} label="Backend" />
        <ServiceIcon name="cpu" connected={aiConnected} loading={isLoading} label="IA" />
        <span className="hidden pr-1 text-xs font-semibold text-on-surface-variant sm:inline">
          {runtimeConfig.isDemoMode
            ? "Demonstração"
            : isLoading
              ? "Verificando"
              : backendConnected && aiConnected
                ? "Serviços online"
                : "Atenção"}
        </span>
      </summary>

      <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-2xl shadow-black/40">
        <div className="border-b border-outline-variant/40 px-4 py-3">
          <p className="text-sm font-semibold text-on-surface">Conexões do ClimaGrid</p>
          <p className="mt-1 text-xs text-on-surface-variant">Estado da última verificação dos serviços.</p>
        </div>
        <div className="space-y-3 p-4">
          <ServiceRow icon="cloud" label="Backend NestJS" connected={backendConnected} loading={isLoading} />
          <ServiceRow icon="cpu" label="Serviço de IA" connected={aiConnected} loading={isLoading} />
          {runtimeConfig.isDemoMode ? (
            <p className="rounded-lg bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-200">A URL da API não está configurada. Os dados do replay são demonstrativos.</p>
          ) : error ? (
            <p className="rounded-lg bg-error-container/30 px-3 py-2 text-xs leading-5 text-on-error-container">{error}</p>
          ) : null}
          <button type="button" className="button-secondary min-h-9 w-full px-3 py-1.5 text-xs" disabled={isLoading || runtimeConfig.isDemoMode} onClick={() => void refresh()}>
            <Icon name="refresh" className={isLoading ? "animate-spin" : ""} />
            Verificar novamente
          </button>
        </div>
      </div>
    </details>
  );
}

function ServiceIcon({ name, connected, loading, label }: { name: "cloud" | "cpu"; connected: boolean; loading: boolean; label: string }) {
  const color = loading ? "bg-outline/15 text-outline" : connected ? "bg-blue-500/15 text-blue-300" : "bg-red-500/15 text-red-300";
  return (
    <span title={`${label}: ${loading ? "verificando" : connected ? "conectado" : "desconectado"}`} className={`relative flex h-7 w-7 items-center justify-center rounded-full ${color}`}>
      <Icon name={name} className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
      {!loading ? <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-surface-container-lowest ${connected ? "bg-blue-400" : "bg-red-400"}`} /> : null}
    </span>
  );
}

function ServiceRow({ icon, label, connected, loading }: { icon: "cloud" | "cpu"; label: string; connected: boolean; loading: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-sm text-on-surface"><Icon name={icon} className="h-4 w-4 text-on-surface-variant" />{label}</span>
      <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${loading ? "bg-outline/10 text-outline" : connected ? "bg-blue-500/10 text-blue-300" : "bg-red-500/10 text-red-300"}`}>
        {loading ? "Verificando" : connected ? "Conectado" : "Desconectado"}
      </span>
    </div>
  );
}
