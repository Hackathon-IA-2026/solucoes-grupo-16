"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useScenario } from "@/context/scenario-context";
import { climagridApi, runtimeConfig } from "@/lib/api";

export default function BusMappingPage() {
  const router = useRouter();
  const pwfInputRef = useRef<HTMLInputElement>(null);
  const { state, isHydrated, setReferencePwf, setStudyName, updateMapping } = useScenario();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const selectedPlants = useMemo(
    () => state.estimates.filter((plant) => state.selectedPlantIds.includes(plant.id)),
    [state.estimates, state.selectedPlantIds],
  );
  const selectedPlantIds = useMemo(() => new Set(state.selectedPlantIds), [state.selectedPlantIds]);
  const allocations = useMemo(
    () => Object.values(state.study.mappings).filter((mapping) => selectedPlantIds.has(mapping.plantId)),
    [selectedPlantIds, state.study.mappings],
  );
  const plantsById = useMemo(
    () => new Map(selectedPlants.map((plant) => [plant.id, plant])),
    [selectedPlants],
  );
  const targets = state.study.generationTargets.filter((target) => target.editable);
  const mappedCount = allocations.filter((mapping) => mapping.busNumber).length;
  const isReady = Boolean(
    selectedPlants.length > 0
    && allocations.length > 0
    && mappedCount === allocations.length
    && state.study.name.trim()
    && state.study.referencePwf,
  );
  const partialCoverage = selectedPlants.filter((plant) => plant.mappingCoveragePercent < 100);

  async function handleReferencePwf(file: File | null) {
    setUploadError(null);
    if (!file) {
      setReferencePwf(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pwf")) {
      setUploadError("Selecione um arquivo com extensão .pwf.");
      if (pwfInputRef.current) pwfInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const reference = await climagridApi.uploadReferencePwf(file);
      const generationTargets = runtimeConfig.isDemoMode
        ? selectedPlants.flatMap((plant) => plant.suggestedBusAllocations.map((allocation) => ({
            kind: "bus" as const,
            busNumber: Number(allocation.busNumber),
            busName: allocation.busName,
            busType: 1 as const,
            baseVoltageKv: 230,
            area: 1,
            activeGenerationMw: 0,
            editable: true,
            generatorGroups: [],
          })))
        : reference.id
          ? await climagridApi.getPwfGenerationTargets(reference.id)
          : [];
      setReferencePwf(reference, generationTargets);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível enviar o caso base.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleTargetChange(allocationId: string, busNumber: string) {
    const target = targets.find((item) => String(item.busNumber) === busNumber);
    updateMapping(allocationId, {
      busNumber,
      busName: target?.busName ?? "",
      nominalVoltageKv: target?.baseVoltageKv?.toString() ?? "",
      area: target?.area?.toString() ?? "",
    });
  }

  if (!isHydrated) {
    return <AppShell><div className="h-80 animate-pulse rounded-2xl bg-surface-container-low" /></AppShell>;
  }

  if (selectedPlants.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/10 text-secondary"><Icon name="network" className="h-7 w-7" /></span>
          <h1 className="mt-5 text-2xl font-semibold">Nenhuma usina selecionada</h1>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">Selecione ao menos uma usina antes de criar a distribuição por barras.</p>
          <Link href="/usinas-estimativas" className="button-primary mt-6"><Icon name="arrow-left" /> Voltar às usinas</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Etapa 3 de 4 · Distribuição usina → barras"
          title="Valide as barras do caso PWF"
          description="O sistema usa o CEG de cada usina para localizar as barras e reparte a geração observada proporcionalmente à capacidade conectada. Revise as sugestões antes de exportar."
          aside={<div className="min-w-44 rounded-xl bg-surface-container-lowest px-4 py-3"><div className="flex items-center justify-between text-xs"><span className="text-on-surface-variant">Alocações válidas</span><strong className="text-secondary">{mappedCount}/{allocations.length || "—"}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-variant"><div className="h-full bg-secondary transition-all" style={{ width: `${allocations.length ? (mappedCount / allocations.length) * 100 : 0}%` }} /></div></div>}
        />

        <Notice title="Como a geração é distribuída">
          Um conjunto ONS pode alimentar várias barras. Cada parcela abaixo é calculada por capacidade e a soma das parcelas preserva exatamente a geração observada do conjunto. Se vários conjuntos chegarem à mesma barra, o backend somará os valores antes de escrever o Pg.
        </Notice>
        {partialCoverage.length > 0 ? <Notice tone="warning" title="Mapeamento parcial">{partialCoverage.length} conjunto(s) possuem algum membro sem correspondência CEG na planilha de referência. Revise essas alocações com o especialista antes do uso no ANAREDE.</Notice> : null}

        <section className="grid gap-5 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm lg:grid-cols-2 lg:p-6">
          <div>
            <label className="field-label" htmlFor="study-name">Nome do estudo</label>
            <input id="study-name" className="field-input" placeholder="Ex.: Replay 15/01/2024 12h" value={state.study.name} onChange={(event) => setStudyName(event.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="reference-pwf">Caso base ANAREDE (.pwf)</label>
            <input ref={pwfInputRef} id="reference-pwf" type="file" accept=".pwf" className="sr-only" onChange={(event) => void handleReferencePwf(event.target.files?.[0] ?? null)} />
            {state.study.referencePwf ? (
              <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/5 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-on-surface">{state.study.referencePwf.name}</p><p className="mt-0.5 text-[10px] text-on-surface-variant">{state.study.referencePwf.busCount?.toLocaleString("pt-BR") ?? "—"} barras · {state.study.referencePwf.generatorBusCount?.toLocaleString("pt-BR") ?? "—"} barras geradoras · {state.study.referencePwf.generatorGroupCount?.toLocaleString("pt-BR") ?? "—"} grupos DGEI</p></div>
                  <button type="button" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container hover:text-error" onClick={() => { setReferencePwf(null); if (pwfInputRef.current) pwfInputRef.current.value = ""; }} aria-label="Remover caso base"><Icon name="trash" /></button>
                </div>
              </div>
            ) : (
              <label htmlFor="reference-pwf" className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-secondary/50 bg-surface-container-lowest px-4 py-3 text-sm font-medium text-secondary hover:border-secondary"><Icon name="upload" /> {isUploading ? "Analisando PWF…" : "Selecionar caso base"}</label>
            )}
            {uploadError ? <p className="mt-2 text-sm text-error">{uploadError}</p> : null}
          </div>
        </section>

        {state.study.referencePwf ? (
          <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-low shadow-sm">
            <div className="border-b border-outline-variant/40 p-5"><h2 className="font-semibold text-on-surface">Alocações propostas</h2><p className="mt-1 text-sm text-on-surface-variant">A lista contém uma linha por parcela de geração e por barra.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead className="bg-surface-container-lowest text-[10px] uppercase tracking-wider text-outline"><tr><th className="px-5 py-3">Conjunto ONS</th><th className="px-3 py-3 text-right">Parcela</th><th className="px-3 py-3 text-right">Pg</th><th className="px-3 py-3">Barra do PWF</th><th className="px-5 py-3">Situação</th></tr></thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {allocations.map((allocation) => {
                    const plant = plantsById.get(allocation.plantId);
                    return (
                      <tr key={allocation.allocationId}>
                        <td className="px-5 py-4"><p className="text-sm font-medium text-on-surface">{plant?.name ?? allocation.plantId}</p><p className="font-mono text-[10px] text-outline">{plant?.onsId ?? allocation.plantId}</p></td>
                        <td className="px-3 py-4 text-right font-mono text-sm text-on-surface-variant">{(allocation.allocationFactor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
                        <td className="px-3 py-4 text-right font-mono text-sm font-semibold text-secondary">{allocation.generationMw.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} MW</td>
                        <td className="px-3 py-4"><select className="field-input min-w-72" value={allocation.busNumber} onChange={(event) => handleTargetChange(allocation.allocationId, event.target.value)}><option value="">Selecione uma barra</option>{targets.map((target) => <option key={target.busNumber} value={target.busNumber}>{target.busNumber} · {target.busName} · Pg {target.activeGenerationMw.toLocaleString("pt-BR")} MW</option>)}</select></td>
                        <td className="px-5 py-4">{allocation.busNumber ? <span className="inline-flex rounded-full bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">Correspondência validada</span> : <span className="inline-flex rounded-full bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200">Revisão necessária</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/usinas-estimativas" className="button-secondary"><Icon name="arrow-left" /> Voltar às usinas</Link>
          <button type="button" disabled={!isReady} onClick={() => router.push("/exportacao-pwf")} className="button-primary">Revisar exportação<Icon name="arrow-right" /></button>
        </div>
      </div>
    </AppShell>
  );
}
