"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useScenario } from "@/context/scenario-context";
import { runtimeConfig } from "@/lib/api";
import type { CurtailmentReason, RiskLevel } from "@/types/climagrid";

const reasonLabels: Record<CurtailmentReason, string> = {
  REL: "Indisponibilidade externa",
  CNF: "Confiabilidade",
  ENE: "Razão energética",
  PAR: "Parecer de acesso",
  NONE: "Sem sinal relevante",
};

export default function GenerationEstimatesPage() {
  const router = useRouter();
  const { state, isHydrated, setSelectedPlantIds, togglePlant } = useScenario();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL");

  const filteredEstimates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return state.estimates.filter((plant) => {
      const matchesQuery = !normalizedQuery || `${plant.name} ${plant.onsId}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery);
      const matchesState = stateFilter === "ALL" || plant.state === stateFilter;
      const matchesRisk = riskFilter === "ALL" || plant.riskLevel === riskFilter;
      return matchesQuery && matchesState && matchesRisk;
    });
  }, [query, riskFilter, state.estimates, stateFilter]);

  const selectedSet = useMemo(() => new Set(state.selectedPlantIds), [state.selectedPlantIds]);
  const selectedPlants = state.estimates.filter((plant) => selectedSet.has(plant.id));
  const selectedGeneration = selectedPlants.reduce((total, plant) => total + plant.estimatedGenerationMw, 0);
  const selectedCapacity = selectedPlants.reduce((total, plant) => total + plant.installedCapacityMw, 0);
  const allFilteredSelected = filteredEstimates.length > 0 && filteredEstimates.every((plant) => selectedSet.has(plant.id));

  function toggleVisible() {
    const visibleIds = filteredEstimates.map((plant) => plant.id);
    setSelectedPlantIds(
      allFilteredSelected
        ? state.selectedPlantIds.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...state.selectedPlantIds, ...visibleIds])),
    );
  }

  if (!isHydrated) {
    return <AppShell><div className="h-80 animate-pulse rounded-2xl bg-surface-container-low" /></AppShell>;
  }

  if (!state.climateScenario || state.estimates.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10 text-secondary"><Icon name="wind" className="h-7 w-7" /></span>
          <h1 className="mt-5 text-2xl font-semibold">Nenhum cenário processado</h1>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">Defina os dados climáticos da etapa 1 para solicitar as estimativas de geração por usina.</p>
          <Link href="/" className="button-primary mt-6"><Icon name="arrow-left" /> Ir para entrada climática</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Etapa 2 de 4 · Geração estimada"
          title="Selecione as usinas do estudo"
          description="Revise a geração prevista e o intervalo de confiança retornados pelo modelo. Somente as usinas selecionadas seguirão para o mapeamento elétrico."
          aside={<div className="rounded-xl bg-surface-container-lowest px-4 py-3 text-right"><p className="text-[10px] font-semibold uppercase tracking-wider text-outline">Selecionadas</p><p className="mt-1 text-xl font-semibold text-secondary">{state.selectedPlantIds.length} de {state.estimates.length}</p></div>}
        />

        {runtimeConfig.isDemoMode ? <Notice tone="warning" title="Resultados simulados">Os valores desta tabela são uma massa de demonstração do frontend, não uma saída do modelo preditivo da equipe.</Notice> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo da seleção">
          <Metric label="Geração estimada" value={`${selectedGeneration.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MW`} detail="soma das usinas selecionadas" />
          <Metric label="Capacidade instalada" value={`${selectedCapacity.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} MW`} detail="limite físico cadastrado" />
          <Metric label="Fator estimado" value={selectedCapacity > 0 ? `${((selectedGeneration / selectedCapacity) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"} detail="geração / capacidade" />
          <Metric label="Fonte do cenário" value={state.climateScenario.source === "historical" ? "ERA5 + ONS" : "Upload"} detail={state.climateScenario.snapshotDate ? `snapshot ${state.climateScenario.snapshotDate}` : state.climateScenario.fileName ?? "arquivo do usuário"} />
        </section>

        <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-low shadow-sm">
          <div className="flex flex-col gap-3 border-b border-outline-variant/40 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1 lg:max-w-lg">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
              <input className="field-input pl-10" placeholder="Buscar por nome ou ID ONS" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select className="field-input min-w-32" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} aria-label="Filtrar por estado">
                <option value="ALL">Todos os estados</option>
                {["BA", "CE", "PE", "PI", "RN"].map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
              <select className="field-input min-w-40" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} aria-label="Filtrar por risco">
                <option value="ALL">Todos os riscos</option>
                <option value="high">Risco alto</option>
                <option value="medium">Risco médio</option>
                <option value="low">Risco baixo</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="bg-surface-container-lowest text-[10px] uppercase tracking-wider text-outline">
                <tr>
                  <th className="w-12 px-4 py-3"><input type="checkbox" checked={allFilteredSelected} onChange={toggleVisible} aria-label="Selecionar usinas visíveis" /></th>
                  <th className="px-3 py-3">Usina</th>
                  <th className="px-3 py-3">UF</th>
                  <th className="px-3 py-3 text-right">Capacidade</th>
                  <th className="px-3 py-3 text-right">Estimativa</th>
                  <th className="px-3 py-3 text-right">Intervalo {state.estimates[0]?.confidencePercent}%</th>
                  <th className="px-3 py-3 text-right">Disponibilidade hist.</th>
                  <th className="px-4 py-3">Sinal de risco</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filteredEstimates.map((plant) => (
                  <tr key={plant.id} className={`transition-colors hover:bg-surface-container ${selectedSet.has(plant.id) ? "bg-primary-container/5" : ""}`}>
                    <td className="px-4 py-4"><input type="checkbox" checked={selectedSet.has(plant.id)} onChange={() => togglePlant(plant.id)} aria-label={`Selecionar ${plant.name}`} /></td>
                    <td className="px-3 py-4"><p className="text-sm font-medium text-on-surface">{plant.name}</p><p className="mt-0.5 font-mono text-[10px] text-outline">{plant.onsId}</p></td>
                    <td className="px-3 py-4 text-sm text-on-surface-variant">{plant.state}</td>
                    <td className="px-3 py-4 text-right font-mono text-sm text-on-surface-variant">{plant.installedCapacityMw.toLocaleString("pt-BR")} MW</td>
                    <td className="px-3 py-4 text-right font-mono text-sm font-semibold text-secondary">{plant.estimatedGenerationMw.toLocaleString("pt-BR")} MW</td>
                    <td className="px-3 py-4 text-right font-mono text-xs text-on-surface-variant">{plant.confidenceLowMw.toLocaleString("pt-BR")}–{plant.confidenceHighMw.toLocaleString("pt-BR")} MW</td>
                    <td className="px-3 py-4 text-right font-mono text-sm text-on-surface-variant">{plant.historicalAvailabilityPercent.toLocaleString("pt-BR")}%</td>
                    <td className="px-4 py-4"><RiskBadge level={plant.riskLevel} reason={plant.probableReason} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredEstimates.length === 0 ? <div className="p-10 text-center text-sm text-on-surface-variant">Nenhuma usina corresponde aos filtros.</div> : null}
          </div>
        </section>

        <Notice title="Como interpretar esta etapa">A estimativa deve respeitar a capacidade instalada e vir acompanhada de incerteza. O motivo de curtailment é apenas uma classificação provável; risco de confiabilidade só poderá ser confirmado após o fluxo de potência no ANAREDE.</Notice>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="button-secondary"><Icon name="arrow-left" /> Alterar entrada climática</Link>
          <button type="button" disabled={state.selectedPlantIds.length === 0} onClick={() => router.push("/mapeamento-barras")} className="button-primary">Mapear {state.selectedPlantIds.length} {state.selectedPlantIds.length === 1 ? "usina" : "usinas"}<Icon name="arrow-right" /></button>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p><p className="mt-2 text-xl font-semibold text-on-surface">{value}</p><p className="mt-1 truncate text-xs text-on-surface-variant">{detail}</p></div>;
}

function RiskBadge({ level, reason }: { level: RiskLevel; reason: CurtailmentReason }) {
  const classes = level === "high" ? "bg-error/10 text-error" : level === "medium" ? "bg-amber-300/10 text-amber-200" : "bg-emerald-300/10 text-emerald-200";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${classes}`}>{reason === "NONE" ? reasonLabels.NONE : `${reason} · ${reasonLabels[reason]}`}</span>;
}
