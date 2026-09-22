"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useScenario } from "@/context/scenario-context";
import { climagridApi, runtimeConfig } from "@/lib/api";
import type { CurtailmentReason, PwfExportResult } from "@/types/climagrid";

const categoryDescriptions: Record<Exclude<CurtailmentReason, "NONE">, string> = {
  REL: "Indisponibilidade externa ou limitação fora das instalações da usina.",
  CNF: "Risco potencial de confiabilidade; exige confirmação no fluxo de potência do ANAREDE.",
  ENE: "Geração acima da capacidade momentânea de absorção do sistema.",
  PAR: "Restrição associada às condições do parecer de acesso.",
};

export default function PwfExportPage() {
  const { state, isHydrated } = useScenario();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<Omit<PwfExportResult, "blob"> | null>(null);

  const selectedPlants = useMemo(
    () => state.estimates.filter((plant) => state.selectedPlantIds.includes(plant.id)),
    [state.estimates, state.selectedPlantIds],
  );

  const readiness = useMemo(() => {
    const pendingPlants = selectedPlants.filter((plant) => {
      const mapping = state.study.mappings[plant.id];
      return !mapping?.busNumber;
    });
    const busNumbers = selectedPlants.map((plant) => state.study.mappings[plant.id]?.busNumber).filter(Boolean) as string[];
    const duplicateBuses = Array.from(new Set(busNumbers.filter((number, index) => busNumbers.indexOf(number) !== index)));
    const blockers = [
      ...(!state.climateScenario ? ["Cenário climático ausente."] : []),
      ...(selectedPlants.length === 0 ? ["Nenhuma usina selecionada."] : []),
      ...(!state.study.name.trim() ? ["Nome do cenário ausente."] : []),
      ...(!state.study.referencePwf ? ["Caso base PWF ausente."] : []),
      ...(pendingPlants.length > 0 ? [`${pendingPlants.length} usina(s) com mapeamento incompleto.`] : []),
      ...(duplicateBuses.length > 0 ? [`Barras duplicadas: ${duplicateBuses.join(", ")}.`] : []),
    ];
    return { blockers, pendingPlants, duplicateBuses, isReady: blockers.length === 0 };
  }, [selectedPlants, state.climateScenario, state.study]);

  const totalGeneration = selectedPlants.reduce((sum, plant) => sum + plant.estimatedGenerationMw, 0);
  const highRiskCount = selectedPlants.filter((plant) => plant.riskLevel === "high").length;

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
          eyebrow="Etapa 4 de 4 · Exportação e risco"
          title="Revise o cenário antes de gerar o PWF"
          description="Confira o de-para e a rastreabilidade. O arquivo final preserva o caso base e altera somente a geração ativa das barras mapeadas."
          aside={<span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${readiness.isReady ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-amber-300/30 bg-amber-300/10 text-amber-200"}`}><span className={`h-2 w-2 rounded-full ${readiness.isReady ? "bg-emerald-300" : "bg-amber-300"}`} />{readiness.isReady ? "Pronto para exportar" : "Configuração incompleta"}</span>}
        />

        {runtimeConfig.isDemoMode ? <Notice tone="warning" title="Exportação sem validade técnica">No modo demonstração, o download será um arquivo-texto de conferência, identificado como inválido para o ANAREDE. O PWF real depende do writer do backend e de um caso base validado.</Notice> : null}

        {readiness.blockers.length > 0 ? (
          <Notice tone="error" title="Exportação bloqueada">
            <ul className="list-disc space-y-1 pl-4">{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          </Notice>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Usinas mapeadas" value={`${selectedPlants.length}`} detail="selecionadas no cenário" />
          <SummaryCard label="Geração estimada" value={`${totalGeneration.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MW`} detail="não é geração verificada" />
          <SummaryCard label="Sinais de risco alto" value={state.climateScenario?.modelScope === "demonstration" ? `${highRiskCount}` : "—"} detail={state.climateScenario?.modelScope === "demonstration" ? "classificação demonstrativa" : "classificador ainda não integrado"} />
          <SummaryCard label="Caso base" value={state.study.referencePwf ? "Recebido" : "Pendente"} detail={state.study.referencePwf?.name ?? "necessário para o PWF"} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-low shadow-sm">
            <div className="border-b border-outline-variant/40 p-5"><h2 className="font-semibold text-on-surface">Usinas, barras e geração</h2><p className="mt-1 text-sm text-on-surface-variant">O classificador de curtailment ainda não faz parte da integração real.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left">
                <thead className="bg-surface-container-lowest text-[10px] uppercase tracking-wider text-outline"><tr><th className="px-5 py-3">Usina</th><th className="px-3 py-3">Barra</th><th className="px-3 py-3 text-right">Geração</th><th className="px-3 py-3">Motivo provável</th><th className="px-5 py-3">Validação</th></tr></thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {selectedPlants.map((plant) => {
                    const mapping = state.study.mappings[plant.id];
                    return (
                      <tr key={plant.id}>
                        <td className="px-5 py-4"><p className="text-sm font-medium text-on-surface">{plant.name}</p><p className="mt-0.5 font-mono text-[10px] text-outline">{plant.onsId}</p></td>
                        <td className="px-3 py-4"><p className="font-mono text-sm text-on-surface">{mapping?.busNumber || "—"}</p><p className="text-[10px] text-outline">{mapping ? `${mapping.busName} · ${mapping.nominalVoltageKv} kV` : "não mapeada"}</p></td>
                        <td className="px-3 py-4 text-right font-mono text-sm text-secondary">{plant.estimatedGenerationMw.toLocaleString("pt-BR")} MW</td>
                        <td className="px-3 py-4"><ReasonBadge reason={plant.probableReason} /></td>
                        <td className="px-5 py-4 text-xs text-on-surface-variant">{plant.probableReason === null ? "Não modelado" : plant.probableReason === "CNF" ? "Pendente do ANAREDE" : plant.probableReason === "NONE" ? "Sem alerta no modelo" : "Probabilidade do modelo"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectedPlants.length === 0 ? <div className="p-8 text-center text-sm text-on-surface-variant">Nenhuma usina selecionada.</div> : null}
            </div>
          </section>

          <aside className="space-y-5">
            {selectedPlants.some((plant) => plant.probableReason !== null) ? (
              <section className="rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm">
                <h2 className="font-semibold text-on-surface">Categorias ONS usadas</h2>
                <div className="mt-4 space-y-4">
                  {(Object.entries(categoryDescriptions) as Array<[Exclude<CurtailmentReason, "NONE">, string]>).map(([code, description]) => <div key={code} className="flex gap-3"><span className="flex h-7 w-10 shrink-0 items-center justify-center rounded bg-surface-container-high font-mono text-[10px] font-bold text-secondary">{code}</span><p className="text-xs leading-5 text-on-surface-variant">{description}</p></div>)}
                </div>
              </section>
            ) : (
              <Notice title="Curtailment ainda não modelado">Os dados ONS entram na disponibilidade histórica, mas a classificação REL/CNF/ENE/PAR ainda não foi implementada pelo serviço preditivo.</Notice>
            )}

            <section className="rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm">
              <h2 className="font-semibold text-on-surface">Rastreabilidade preparada</h2>
              <dl className="mt-4 space-y-3 text-xs">
                <TraceRow label="Cenário" value={state.study.name || "—"} />
                <TraceRow label="Dados" value={state.climateScenario?.snapshotDate ?? state.climateScenario?.fileName ?? "—"} />
                <TraceRow label="Modelo" value={state.climateScenario?.modelVersion ?? (runtimeConfig.isDemoMode ? "mock-local-v1" : "—")} />
                <TraceRow label="Caso base" value={state.study.referencePwf?.name ?? "—"} />
              </dl>
            </section>
          </aside>
        </div>

        {exportError ? <Notice tone="error" title="Falha na exportação">{exportError}</Notice> : null}
        {exportResult ? <Notice tone="success" title="Arquivo gerado"><strong>{exportResult.filename}</strong> foi baixado em {new Date(exportResult.generatedAt).toLocaleString("pt-BR")}. Modelo: {exportResult.modelVersion}; dados: {exportResult.dataVersion}.</Notice> : null}

        <section className="flex flex-col gap-4 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><h2 className="font-semibold text-on-surface">{runtimeConfig.isDemoMode ? "Gerar artefato de demonstração" : "Gerar arquivo PWF"}</h2><p className="mt-1 text-sm text-on-surface-variant">{runtimeConfig.isDemoMode ? "Permite testar o download sem se passar por um PWF válido." : "A API preservará o caso base e alterará somente as barras mapeadas."}</p></div>
          <button type="button" disabled={!readiness.isReady || isExporting} onClick={() => void handleExport()} className="button-primary shrink-0"><Icon name="download" />{isExporting ? "Gerando…" : runtimeConfig.isDemoMode ? "Baixar demonstração" : "Gerar e baixar PWF"}</button>
        </section>

        <div className="flex justify-start"><Link href="/mapeamento-barras" className="button-secondary"><Icon name="arrow-left" /> Voltar ao mapeamento</Link></div>
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-outline">{label}</p><p className="mt-2 truncate text-xl font-semibold text-on-surface">{value}</p><p className="mt-1 truncate text-xs text-on-surface-variant">{detail}</p></div>;
}

function ReasonBadge({ reason }: { reason: CurtailmentReason | null }) {
  if (reason === null) {
    return <span className="inline-flex rounded-full bg-surface-container-high px-2.5 py-1 text-[10px] font-semibold text-on-surface-variant">Não modelado</span>;
  }
  const classes = reason === "NONE" ? "bg-emerald-300/10 text-emerald-200" : reason === "CNF" ? "bg-amber-300/10 text-amber-200" : "bg-secondary/10 text-secondary";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${classes}`}>{reason === "NONE" ? "Sem sinal" : reason}</span>;
}

function TraceRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-outline-variant/30 pb-3 last:border-0 last:pb-0"><dt className="text-on-surface-variant">{label}</dt><dd className="max-w-[65%] break-words text-right font-mono text-on-surface">{value}</dd></div>;
}
