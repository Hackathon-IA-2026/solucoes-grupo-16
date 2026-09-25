"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useScenario } from "@/context/scenario-context";
import { climagridApi, runtimeConfig } from "@/lib/api";
import type { PwfExportResult } from "@/types/climagrid";

export default function PwfExportPage() {
  const { state, isHydrated } = useScenario();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<Omit<PwfExportResult, "blob"> | null>(null);

  const selectedPlants = useMemo(
    () => state.estimates.filter((plant) => state.selectedPlantIds.includes(plant.id)),
    [state.estimates, state.selectedPlantIds],
  );
  const allocationMappings = useMemo(
    () => Object.values(state.study.mappings).filter((mapping) => state.selectedPlantIds.includes(mapping.plantId)),
    [state.selectedPlantIds, state.study.mappings],
  );
  const readiness = useMemo(() => {
    const pendingMappings = allocationMappings.filter((mapping) => !mapping.busNumber);
    const allocatedPlantIds = new Set(allocationMappings.map((mapping) => mapping.plantId));
    const plantsWithoutAllocations = selectedPlants.filter((plant) => !allocatedPlantIds.has(plant.id));
    const partialMappings = selectedPlants.filter(
      (plant) => plant.mappingCoveragePercent > 0 && plant.mappingCoveragePercent < 100,
    );
    const invalidGeneration = selectedPlants.filter((plant) => plant.observedGenerationMw === null && plant.estimatedGenerationMw === null);
    const blockers = [
      ...(!state.climateScenario ? ["Cenário ausente."] : []),
      ...(selectedPlants.length === 0 ? ["Nenhuma usina selecionada."] : []),
      ...(!state.study.name.trim() ? ["Nome do cenário ausente."] : []),
      ...(!state.study.referencePwf ? ["Caso base PWF ausente."] : []),
      ...(allocationMappings.length === 0 ? ["Distribuição por barras ausente."] : []),
      ...(pendingMappings.length > 0 ? [`${pendingMappings.length} alocação(ões) com mapeamento incompleto.`] : []),
      ...(plantsWithoutAllocations.length > 0 ? [`${plantsWithoutAllocations.length} usina(s) selecionada(s) sem alocação.`] : []),
      ...(partialMappings.length > 0 ? [`${partialMappings.length} usina(s) com cobertura PWF parcial.`] : []),
      ...(invalidGeneration.length > 0 ? [`${invalidGeneration.length} usina(s) sem geração válida.`] : []),
    ];
    return { blockers, isReady: blockers.length === 0 };
  }, [allocationMappings, selectedPlants, state.climateScenario, state.study]);
  const totalGeneration = selectedPlants.reduce((sum, plant) => sum + generationMw(plant), 0);
  const isScenario = state.climateScenario?.mode === "scenario";

  async function handleExport() {
    if (!readiness.isReady || !state.climateScenario) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const result = await climagridApi.exportPwf({
        climateScenario: state.climateScenario,
        estimates: state.estimates,
        selectedPlantIds: state.selectedPlantIds,
        study: state.study,
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const { blob: _blob, ...metadata } = result;
      void _blob;
      setExportResult(metadata);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Não foi possível gerar o arquivo.");
    } finally {
      setIsExporting(false);
    }
  }

  if (!isHydrated) {
    return <AppShell><div className="h-80 animate-pulse rounded-2xl bg-surface-container-low" /></AppShell>;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Etapa 4 de 4 · Exportação PWF"
          title={`Revise a geração ${isScenario ? "estimada" : "observada"} antes de gerar o PWF`}
          description={`O arquivo final preserva o caso base e substitui somente o campo Pg das barras mapeadas pelos valores ${isScenario ? "estimados pela curva física" : "observados pela ONS"} no instante selecionado.`}
          aside={<span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${readiness.isReady ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-amber-300/30 bg-amber-300/10 text-amber-200"}`}><span className={`h-2 w-2 rounded-full ${readiness.isReady ? "bg-emerald-300" : "bg-amber-300"}`} />{readiness.isReady ? "Pronto para exportar" : "Configuração incompleta"}</span>}
        />

        {runtimeConfig.isDemoMode ? <Notice tone="warning" title="Exportação sem validade técnica">Sem a API, o download é apenas um arquivo-texto demonstrativo e não um PWF válido.</Notice> : null}
        {readiness.blockers.length > 0 ? <Notice tone="error" title="Exportação bloqueada"><ul className="list-disc space-y-1 pl-4">{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></Notice> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Usinas mapeadas" value={`${selectedPlants.length}`} detail="selecionadas no cenário" />
          <SummaryCard label={isScenario ? "Potencial estimado" : "Geração observada"} value={`${totalGeneration.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MW`} detail={isScenario ? "curva física e disponibilidade informada" : "valor horário da ONS"} />
          <SummaryCard label="Instante" value={state.climateScenario ? new Date(state.climateScenario.timestamp).toLocaleDateString("pt-BR") : "—"} detail={state.climateScenario ? new Date(state.climateScenario.timestamp).toLocaleTimeString("pt-BR") : "cenário pendente"} />
          <SummaryCard label="Caso base" value={state.study.referencePwf ? "Recebido" : "Pendente"} detail={state.study.referencePwf?.name ?? "necessário para o PWF"} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-low shadow-sm">
            <div className="border-b border-outline-variant/40 p-5"><h2 className="font-semibold text-on-surface">Usinas, barras e geração</h2><p className="mt-1 text-sm text-on-surface-variant">Confira os valores que serão escritos no campo Pg.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="bg-surface-container-lowest text-[10px] uppercase tracking-wider text-outline"><tr><th className="px-5 py-3">Usina</th><th className="px-3 py-3">Barra</th><th className="px-3 py-3 text-right">{isScenario ? "Pg estimado" : "Pg observado"}</th><th className="px-5 py-3">Fonte</th></tr></thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {selectedPlants.map((plant) => {
                    const mappings = allocationMappings.filter((mapping) => mapping.plantId === plant.id);
                    return (
                      <tr key={plant.id}>
                        <td className="px-5 py-4"><p className="text-sm font-medium text-on-surface">{plant.name}</p><p className="mt-0.5 font-mono text-[10px] text-outline">{plant.onsId}</p></td>
                        <td className="px-3 py-4"><p className="font-mono text-sm text-on-surface">{mappings.map((mapping) => mapping.busNumber).join(", ") || "—"}</p><p className="text-[10px] text-outline">{mappings.length} parcela(s) de geração</p></td>
                        <td className="px-3 py-4 text-right font-mono text-sm text-secondary">{generationMw(plant).toLocaleString("pt-BR")} MW</td>
                        <td className="px-5 py-4 text-xs text-on-surface-variant">{isScenario ? `Curva física · ${state.climateScenario?.weatherSource === "ERA5" ? "vento ERA5" : "vento do usuário"}` : "ONS · geração verificada"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectedPlants.length === 0 ? <div className="p-8 text-center text-sm text-on-surface-variant">Nenhuma usina selecionada.</div> : null}
            </div>
          </section>

          <aside className="space-y-5">
            <Notice title="Alteração controlada">O writer mantém tamanho, codificação e blocos do caso base, inclusive DGEI e DGER. Apenas as cinco colunas fixas de Pg no DBAR das barras selecionadas são modificadas.</Notice>
            <section className="rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm">
              <h2 className="font-semibold text-on-surface">Rastreabilidade</h2>
              <dl className="mt-4 space-y-3 text-xs">
                <TraceRow label="Cenário" value={state.study.name || "—"} />
                <TraceRow label="Dados" value={state.climateScenario?.dataVersion ?? "—"} />
                <TraceRow label="Cenário persistido" value={state.climateScenario?.id ?? "—"} />
                <TraceRow label="Schema" value={state.climateScenario?.traceability?.schemaVersion ?? "—"} />
                <TraceRow label="CSV SHA-256" value={state.climateScenario?.traceability?.inputSha256 ?? "—"} />
                <TraceRow label="Catálogo SHA-256" value={state.climateScenario?.traceability?.catalogSha256 ?? "—"} />
                <TraceRow label="Estimador" value={state.climateScenario?.traceability?.estimatorVersion ?? "—"} />
                <TraceRow label="Disponibilidade" value={!isScenario ? "Não se aplica" : state.climateScenario?.traceability?.availabilitySource === "USER_GLOBAL_ASSUMPTION" ? `Hipótese do usuário · ${((state.climateScenario.traceability.availabilityValue ?? 0) * 100).toLocaleString("pt-BR")}%` : "Informada no CSV"} />
                <TraceRow label="Geração" value={isScenario ? "Potencial físico estimado" : "ONS observada"} />
                <TraceRow label="Vento" value={isScenario ? (state.climateScenario?.weatherSource === "ERA5" ? "Copernicus ERA5 histórico" : "Arquivo do usuário") : "ERA5"} />
                <TraceRow label="Caso base" value={state.study.referencePwf?.name ?? "—"} />
              </dl>
            </section>
          </aside>
        </div>

        {exportError ? <Notice tone="error" title="Falha na exportação">{exportError}</Notice> : null}
        {exportResult ? <Notice tone="success" title="Arquivo gerado"><strong>{exportResult.filename}</strong> foi baixado em {new Date(exportResult.generatedAt).toLocaleString("pt-BR")}. Origem: geração {exportResult.generationSource === "observed" ? "observada" : "estimada"}; dados: {exportResult.dataVersion}.{exportResult.exportId ? ` Manifesto: ${exportResult.exportId}.` : ""}{exportResult.outputSha256 ? ` SHA-256: ${exportResult.outputSha256}.` : ""}</Notice> : null}

        <section className="flex flex-col gap-4 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><h2 className="font-semibold text-on-surface">{runtimeConfig.isDemoMode ? "Gerar artefato de demonstração" : "Gerar arquivo PWF"}</h2><p className="mt-1 text-sm text-on-surface-variant">{runtimeConfig.isDemoMode ? "Permite testar o download sem se passar por um PWF válido." : "A API preservará o caso base e alterará somente as barras mapeadas."}</p></div>
          <button type="button" disabled={!readiness.isReady || isExporting} onClick={() => void handleExport()} className="button-primary shrink-0"><Icon name="download" />{isExporting ? "Gerando…" : runtimeConfig.isDemoMode ? "Baixar demonstração" : "Gerar e baixar PWF"}</button>
        </section>

        <div className="flex justify-start"><Link href="/mapeamento-barras" className="button-secondary"><Icon name="arrow-left" /> Voltar ao mapeamento</Link></div>
      </div>
    </AppShell>
  );
}

function generationMw(plant: { observedGenerationMw: number | null; estimatedGenerationMw: number | null }): number {
  return plant.observedGenerationMw ?? plant.estimatedGenerationMw ?? 0;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p><p className="mt-2 truncate text-xl font-semibold text-on-surface">{value}</p><p className="mt-1 truncate text-xs text-on-surface-variant">{detail}</p></div>;
}

function TraceRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-outline-variant/30 pb-3 last:border-0 last:pb-0"><dt className="text-on-surface-variant">{label}</dt><dd className="max-w-[65%] break-words text-right font-mono text-on-surface">{value}</dd></div>;
}
