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
import type { PlantBusMapping } from "@/types/climagrid";

const requiredMappingFields: Array<keyof Omit<PlantBusMapping, "plantId">> = ["busNumber", "busName", "nominalVoltageKv", "area"];

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

  const duplicateBuses = useMemo(() => {
    const counts = new Map<string, number>();
    selectedPlants.forEach((plant) => {
      const busNumber = state.study.mappings[plant.id]?.busNumber.trim();
      if (busNumber) counts.set(busNumber, (counts.get(busNumber) ?? 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([number]) => number));
  }, [selectedPlants, state.study.mappings]);

  const mappedCount = selectedPlants.filter((plant) => {
    const mapping = state.study.mappings[plant.id];
    return mapping && requiredMappingFields.every((field) => mapping[field].trim().length > 0) && !duplicateBuses.has(mapping.busNumber.trim());
  }).length;
  const isReady = selectedPlants.length > 0 && mappedCount === selectedPlants.length && Boolean(state.study.name.trim()) && Boolean(state.study.referencePwf);

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
      setReferencePwf(await climagridApi.uploadReferencePwf(file));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível enviar o caso base.");
    } finally {
      setIsUploading(false);
    }
  }

  if (!isHydrated) {
    return <AppShell><div className="h-80 animate-pulse rounded-2xl bg-sidebar-bg" /></AppShell>;
  }

  if (selectedPlants.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-blue/10 text-accent-blue"><Icon name="network" className="h-7 w-7" /></span>
          <h1 className="mt-5 text-2xl font-semibold">Nenhuma usina selecionada</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Selecione ao menos uma usina na etapa anterior antes de criar o de-para elétrico.</p>
          <Link href="/usinas-estimativas" className="button-primary mt-6"><Icon name="arrow-left" /> Voltar às usinas</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Etapa 3 de 4 · Mapeamento usina → barra"
          title="Associe manualmente as barras do estudo"
          description="Informe a barra correspondente a cada usina e carregue o caso base PWF. O MVP não infere esse vínculo automaticamente."
          aside={<div className="min-w-44 rounded-2xl bg-card-bg px-4 py-3"><div className="flex items-center justify-between text-xs"><span className="text-text-secondary">Completude</span><strong className="text-accent-blue">{mappedCount}/{selectedPlants.length}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800"><div className="h-full bg-accent-blue transition-all" style={{ width: `${(mappedCount / selectedPlants.length) * 100}%` }} /></div></div>}
        />

        <Notice title="Regra do MVP">Cada barra pode receber apenas uma usina por cenário. A exportação será liberada quando todas as usinas tiverem número, nome, tensão e área, além de um caso base PWF.</Notice>

        <section className="grid gap-5 rounded-2xl border border-neutral-900/50 bg-sidebar-bg p-5 shadow-card lg:grid-cols-2 lg:p-6">
          <div>
            <label className="field-label" htmlFor="study-name">Nome do cenário de estudo</label>
            <input id="study-name" className="field-input" placeholder="Ex.: Ventos fortes — agosto/2026" value={state.study.name} onChange={(event) => setStudyName(event.target.value)} />
            <p className="mt-2 text-xs text-text-secondary">O nome será enviado no log de rastreabilidade da exportação.</p>
          </div>
          <div>
            <label className="field-label" htmlFor="reference-pwf">Caso base ANAREDE (.pwf)</label>
            <input ref={pwfInputRef} id="reference-pwf" type="file" accept=".pwf" className="sr-only" onChange={(event) => void handleReferencePwf(event.target.files?.[0] ?? null)} />
            {state.study.referencePwf ? (
              <div className="flex min-h-11 items-center justify-between rounded-lg border border-emerald-300/25 bg-emerald-300/5 px-3 py-2">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-text-primary">{state.study.referencePwf.name}</p><p className="text-[10px] text-text-secondary">{(state.study.referencePwf.sizeBytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB · recebido {new Date(state.study.referencePwf.uploadedAt).toLocaleString("pt-BR")}</p></div>
                <button type="button" className="rounded-lg p-2 text-text-secondary hover:bg-neutral-900 hover:text-overdue" onClick={() => { setReferencePwf(null); if (pwfInputRef.current) pwfInputRef.current.value = ""; }} aria-label="Remover caso base"><Icon name="trash" /></button>
              </div>
            ) : (
              <label htmlFor="reference-pwf" className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-accent-blue/50 px-3 py-2 text-sm font-medium text-accent-blue hover:border-accent-blue hover:bg-accent-blue/5"><Icon name="upload" className="h-4 w-4" />{isUploading ? "Enviando…" : "Selecionar caso base"}</label>
            )}
            {uploadError ? <p className="mt-2 text-xs text-overdue">{uploadError}</p> : null}
            {runtimeConfig.isDemoMode && state.study.referencePwf ? <p className="mt-2 text-xs text-yellow-500">No modo demonstração, apenas os metadados do arquivo ficam armazenados.</p> : null}
          </div>
        </section>

        {duplicateBuses.size > 0 ? <Notice tone="error" title="Barra duplicada">A RN09 não permite mais de uma usina na mesma barra no MVP. Corrija: {Array.from(duplicateBuses).join(", ")}.</Notice> : null}

        <section className="overflow-hidden rounded-2xl border border-neutral-900/50 bg-sidebar-bg shadow-card">
          <div className="border-b border-neutral-900/40 p-5">
            <h2 className="font-semibold text-text-primary">De-para elétrico</h2>
            <p className="mt-1 text-sm text-text-secondary">Os campos abaixo serão convertidos pelo backend nos registros de geração do caso base.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead className="bg-card-bg text-[10px] uppercase tracking-wider text-text-muted">
                <tr><th className="px-5 py-3">Usina selecionada</th><th className="px-3 py-3">Geração</th><th className="px-3 py-3">Nº da barra</th><th className="px-3 py-3">Nome / apelido</th><th className="px-3 py-3">Tensão nominal</th><th className="px-3 py-3">Área</th><th className="px-5 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/30">
                {selectedPlants.map((plant) => {
                  const mapping = state.study.mappings[plant.id] ?? { plantId: plant.id, busNumber: "", busName: "", nominalVoltageKv: "", area: "" };
                  const hasAllFields = requiredMappingFields.every((field) => mapping[field].trim().length > 0);
                  const isDuplicate = duplicateBuses.has(mapping.busNumber.trim());
                  return (
                    <tr key={plant.id} className="align-top">
                      <td className="px-5 py-4"><p className="text-sm font-medium text-text-primary">{plant.name}</p><p className="mt-0.5 font-mono text-[10px] text-text-muted">{plant.onsId} · {plant.state}</p></td>
                      <td className="px-3 py-4 font-mono text-sm text-accent-blue">{plant.estimatedGenerationMw.toLocaleString("pt-BR")} MW</td>
                      <td className="px-3 py-3"><input className={`table-input ${isDuplicate ? "border-overdue" : ""}`} inputMode="numeric" placeholder="Ex.: 3412" value={mapping.busNumber} onChange={(event) => updateMapping(plant.id, { busNumber: event.target.value.replace(/\D/g, "") })} aria-label={`Número da barra de ${plant.name}`} />{isDuplicate ? <p className="mt-1 text-[10px] text-overdue">Já utilizada</p> : null}</td>
                      <td className="px-3 py-3"><input className="table-input" placeholder="Ex.: CAETITÉ" value={mapping.busName} onChange={(event) => updateMapping(plant.id, { busName: event.target.value })} aria-label={`Nome da barra de ${plant.name}`} /></td>
                      <td className="px-3 py-3"><select className="table-input" value={mapping.nominalVoltageKv} onChange={(event) => updateMapping(plant.id, { nominalVoltageKv: event.target.value })} aria-label={`Tensão da barra de ${plant.name}`}><option value="">Selecione</option>{[69, 138, 230, 500].map((voltage) => <option key={voltage} value={String(voltage)}>{voltage} kV</option>)}</select></td>
                      <td className="px-3 py-3"><input className="table-input" placeholder="Ex.: 32" value={mapping.area} onChange={(event) => updateMapping(plant.id, { area: event.target.value })} aria-label={`Área da barra de ${plant.name}`} /></td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${hasAllFields && !isDuplicate ? "bg-paid/10 text-paid" : "bg-yellow-500/10 text-yellow-500"}`}>{hasAllFields && !isDuplicate ? "Completo" : "Pendente"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/usinas-estimativas" className="button-secondary"><Icon name="arrow-left" /> Alterar seleção</Link>
          <div className="text-right">
            {!isReady ? <p className="mb-2 text-xs text-text-secondary">Preencha o cenário, o caso base e todos os mapeamentos.</p> : null}
            <button type="button" disabled={!isReady} onClick={() => router.push("/exportacao-pwf")} className="button-primary">Revisar risco e exportação<Icon name="arrow-right" /></button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
