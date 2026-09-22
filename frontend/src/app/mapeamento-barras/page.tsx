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

const requiredMappingFields: Array<keyof Omit<PlantBusMapping, "plantId">> = ["busNumber"];

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
      const reference = await climagridApi.uploadReferencePwf(file);
      const targets = !runtimeConfig.isDemoMode && reference.id
        ? await climagridApi.getPwfGenerationTargets(reference.id)
        : [];
      setReferencePwf(reference, targets);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível enviar o caso base.");
    } finally {
      setIsUploading(false);
    }
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
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">Selecione ao menos uma usina na etapa anterior antes de criar o de-para elétrico.</p>
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
          aside={<div className="min-w-44 rounded-xl bg-surface-container-lowest px-4 py-3"><div className="flex items-center justify-between text-xs"><span className="text-on-surface-variant">Completude</span><strong className="text-secondary">{mappedCount}/{selectedPlants.length}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-variant"><div className="h-full bg-secondary transition-all" style={{ width: `${(mappedCount / selectedPlants.length) * 100}%` }} /></div></div>}
        />

        <Notice title="Regra do MVP">Cada barra pode receber apenas uma usina por cenário. Após o upload, as barras são lidas do próprio PWF; somente alvos editáveis podem ser selecionados.</Notice>

        <section className="grid gap-5 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm lg:grid-cols-2 lg:p-6">
          <div>
            <label className="field-label" htmlFor="study-name">Nome do cenário de estudo</label>
            <input id="study-name" className="field-input" placeholder="Ex.: Ventos fortes — agosto/2026" value={state.study.name} onChange={(event) => setStudyName(event.target.value)} />
            <p className="mt-2 text-xs text-on-surface-variant">O nome será enviado no log de rastreabilidade da exportação.</p>
          </div>
          <div>
            <label className="field-label" htmlFor="reference-pwf">Caso base ANAREDE (.pwf)</label>
            <input ref={pwfInputRef} id="reference-pwf" type="file" accept=".pwf" className="sr-only" onChange={(event) => void handleReferencePwf(event.target.files?.[0] ?? null)} />
            {state.study.referencePwf ? (
              <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/5 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-on-surface">{state.study.referencePwf.name}</p>
                    <p className="mt-0.5 text-[10px] text-on-surface-variant">
                      {(state.study.referencePwf.sizeBytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB
                      {state.study.referencePwf.anaredeVersion ? ` · ANAREDE ${state.study.referencePwf.anaredeVersion}` : ""}
                      {state.study.referencePwf.busCount !== undefined ? ` · ${state.study.referencePwf.busCount.toLocaleString("pt-BR")} barras` : ""}
                    </p>
                  </div>
                  <button type="button" className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container hover:text-error" onClick={() => { setReferencePwf(null); if (pwfInputRef.current) pwfInputRef.current.value = ""; }} aria-label="Remover caso base"><Icon name="trash" /></button>
                </div>
                {state.study.referencePwf.title ? <p className="mt-2 text-xs text-on-surface">{state.study.referencePwf.title}</p> : null}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-on-surface-variant">
                  {state.study.referencePwf.studyYear ? <span>Ano do estudo: <strong className="text-on-surface">{state.study.referencePwf.studyYear}</strong></span> : null}
                  {state.study.referencePwf.generatorBusCount !== undefined ? <span>Barras geradoras: <strong className="text-on-surface">{state.study.referencePwf.generatorBusCount.toLocaleString("pt-BR")}</strong></span> : null}
                  {state.study.referencePwf.generatorGroupCount !== undefined ? <span>Grupos DGEI: <strong className="text-on-surface">{state.study.referencePwf.generatorGroupCount.toLocaleString("pt-BR")}</strong></span> : null}
                  {state.study.referencePwf.lineEnding ? <span>{state.study.referencePwf.encoding ?? "codificação desconhecida"} · {state.study.referencePwf.lineEnding}</span> : null}
                </div>
                {state.study.referencePwf.warnings?.map((warning) => <p key={warning} className="mt-2 text-[10px] text-amber-200">{warning}</p>)}
              </div>
            ) : (
              <label htmlFor="reference-pwf" className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-secondary/50 px-3 py-2 text-sm font-medium text-secondary hover:border-secondary hover:bg-secondary/5"><Icon name="upload" className="h-4 w-4" />{isUploading ? "Enviando…" : "Selecionar caso base"}</label>
            )}
            {uploadError ? <p className="mt-2 text-xs text-error">{uploadError}</p> : null}
            {runtimeConfig.isDemoMode && state.study.referencePwf ? <p className="mt-2 text-xs text-amber-200">No modo demonstração, apenas os metadados do arquivo ficam armazenados.</p> : null}
            {!runtimeConfig.isDemoMode && state.study.referencePwf ? <p className="mt-2 text-xs text-on-surface-variant">{(state.study.generationTargets ?? []).filter((target) => target.editable).length.toLocaleString("pt-BR")} barras editáveis encontradas no arquivo.</p> : null}
          </div>
        </section>

        {duplicateBuses.size > 0 ? <Notice tone="error" title="Barra duplicada">A RN09 não permite mais de uma usina na mesma barra no MVP. Corrija: {Array.from(duplicateBuses).join(", ")}.</Notice> : null}

        <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-low shadow-sm">
          <div className="border-b border-outline-variant/40 p-5">
            <h2 className="font-semibold text-on-surface">De-para elétrico</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Selecione uma barra encontrada pelo parser. Nome, tensão e área vêm do caso base e não são digitados manualmente.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead className="bg-surface-container-lowest text-[10px] uppercase tracking-wider text-outline">
                <tr><th className="px-5 py-3">Usina selecionada</th><th className="px-3 py-3">Geração</th><th className="px-3 py-3">Nº da barra</th><th className="px-3 py-3">Nome / apelido</th><th className="px-3 py-3">Tensão nominal</th><th className="px-3 py-3">Área</th><th className="px-5 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {selectedPlants.map((plant) => {
                  const mapping = state.study.mappings[plant.id] ?? { plantId: plant.id, busNumber: "", busName: "", nominalVoltageKv: "", area: "" };
                  const hasAllFields = requiredMappingFields.every((field) => mapping[field].trim().length > 0);
                  const isDuplicate = duplicateBuses.has(mapping.busNumber.trim());
                  return (
                    <tr key={plant.id} className="align-top">
                      <td className="px-5 py-4"><p className="text-sm font-medium text-on-surface">{plant.name}</p><p className="mt-0.5 font-mono text-[10px] text-outline">{plant.onsId} · {plant.state}</p></td>
                      <td className="px-3 py-4 font-mono text-sm text-secondary">{plant.estimatedGenerationMw.toLocaleString("pt-BR")} MW</td>
                      <td className="px-3 py-3">
                        {runtimeConfig.isDemoMode ? (
                          <input className={`table-input ${isDuplicate ? "border-error" : ""}`} inputMode="numeric" placeholder="Ex.: 3412" value={mapping.busNumber} onChange={(event) => updateMapping(plant.id, { busNumber: event.target.value.replace(/\D/g, ""), busName: "Barra demonstrativa", nominalVoltageKv: "230", area: "—" })} aria-label={`Número da barra de ${plant.name}`} />
                        ) : (
                          <select
                            className={`table-input ${isDuplicate ? "border-error" : ""}`}
                            value={mapping.busNumber}
                            disabled={!state.study.referencePwf}
                            onChange={(event) => {
                              const target = (state.study.generationTargets ?? []).find((item) => String(item.busNumber) === event.target.value);
                              updateMapping(plant.id, {
                                busNumber: event.target.value,
                                busName: target?.busName ?? "",
                                nominalVoltageKv: target?.baseVoltageKv === undefined ? "" : String(target.baseVoltageKv),
                                area: target?.area === undefined ? "" : String(target.area),
                              });
                            }}
                            aria-label={`Número da barra de ${plant.name}`}
                          >
                            <option value="">Selecione</option>
                            {(state.study.generationTargets ?? []).filter((target) => target.editable).map((target) => (
                              <option key={target.busNumber} value={String(target.busNumber)}>
                                {target.busNumber} · {target.busName || "sem nome"} · {target.activeGenerationMw.toLocaleString("pt-BR")} MW
                              </option>
                            ))}
                          </select>
                        )}
                        {isDuplicate ? <p className="mt-1 text-[10px] text-error">Já utilizada</p> : null}
                      </td>
                      <td className="px-3 py-3"><input className="table-input" value={mapping.busName} readOnly aria-label={`Nome da barra de ${plant.name}`} /></td>
                      <td className="px-3 py-3"><input className="table-input" value={mapping.nominalVoltageKv ? `${mapping.nominalVoltageKv} kV` : "—"} readOnly aria-label={`Tensão da barra de ${plant.name}`} /></td>
                      <td className="px-3 py-3"><input className="table-input" value={mapping.area || "—"} readOnly aria-label={`Área da barra de ${plant.name}`} /></td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${hasAllFields && !isDuplicate ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-200"}`}>{hasAllFields && !isDuplicate ? "Completo" : "Pendente"}</span></td>
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
            {!isReady ? <p className="mb-2 text-xs text-on-surface-variant">Preencha o cenário, envie o caso base e selecione uma barra para cada usina.</p> : null}
            <button type="button" disabled={!isReady} onClick={() => router.push("/exportacao-pwf")} className="button-primary">Revisar risco e exportação<Icon name="arrow-right" /></button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
