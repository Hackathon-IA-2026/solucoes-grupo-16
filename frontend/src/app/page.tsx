"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useScenario } from "@/context/scenario-context";
import { useSystemStatus } from "@/context/system-context";
import { climagridApi, runtimeConfig } from "@/lib/api";
import { climateFileSchema, validateClimateFile } from "@/lib/file-validation";
import { DEMO_SNAPSHOT_DATE } from "@/lib/mock-data";
import type { ClimateSource, FileValidationResult } from "@/types/climagrid";

const emptyValidation: FileValidationResult = { status: "idle", issues: [] };

export default function ClimateInputPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { resetScenario, setProcessedScenario } = useScenario();
  const { capabilities, isLoading: isLoadingCapabilities, error: capabilitiesError } = useSystemStatus();
  const [source, setSource] = useState<ClimateSource>("historical");
  const [startAt, setStartAt] = useState("2026-08-01T00:00");
  const [endAt, setEndAt] = useState("2026-08-15T23:00");
  const [resolutionMinutes, setResolutionMinutes] = useState<30 | 60>(60);
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<FileValidationResult>(emptyValidation);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHistoricalRangeValid = Boolean(startAt && endAt && Date.parse(startAt) < Date.parse(endAt));
  const isUploadReady = Boolean(file && (validation.status === "valid" || validation.status === "pending-backend"));
  const historicalAvailable = runtimeConfig.isDemoMode || capabilities?.climate.historicalEstimates === true;
  const uploadAvailable = runtimeConfig.isDemoMode || capabilities?.climate.fileUpload === true;
  const canProcess = source === "historical"
    ? isHistoricalRangeValid && historicalAvailable
    : isUploadReady && uploadAvailable;

  async function handleFile(nextFile: File | null) {
    setFile(nextFile);
    setError(null);
    if (!nextFile) {
      setValidation(emptyValidation);
      return;
    }

    setValidation({ status: "validating", fileName: nextFile.name, issues: [] });
    setValidation(await validateClimateFile(nextFile));
  }

  async function handleProcess() {
    if (!canProcess) return;
    setIsProcessing(true);
    setError(null);

    try {
      const result = await climagridApi.processScenario({
        source,
        startAt: source === "upload" ? validation.startAt ?? startAt : startAt,
        endAt: source === "upload" ? validation.endAt ?? endAt : endAt,
        resolutionMinutes,
        file: source === "upload" ? file ?? undefined : undefined,
        rowCount: validation.rowCount,
      });
      setProcessedScenario(result.scenario, result.estimates);
      router.push("/usinas-estimativas");
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Não foi possível processar o cenário.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleReset() {
    resetScenario();
    setSource("historical");
    setStartAt("2026-08-01T00:00");
    setEndAt("2026-08-15T23:00");
    setResolutionMinutes(60);
    setFile(null);
    setValidation(emptyValidation);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Etapa 1 de 4 · Entrada climática"
          title="Defina o cenário de vento"
          description="Escolha um período da base histórica ERA5/ONS ou envie um cenário próprio. O recorte do MVP é exclusivamente eólico e limitado ao subsistema Nordeste."
          aside={
            <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">Fonte ativa</p>
              <p className="mt-1 text-sm font-semibold text-secondary">{source === "historical" ? "Histórico ERA5 + ONS" : "Arquivo do usuário"}</p>
            </div>
          }
        />

        {runtimeConfig.isDemoMode ? (
          <Notice tone="warning" title="Dados demonstrativos">
            A API ainda não está configurada. Ao processar, o frontend usará uma amostra fictícia para validar a jornada. Nenhum valor deve ser usado em estudo elétrico.
          </Notice>
        ) : null}

        {!runtimeConfig.isDemoMode && capabilitiesError ? (
          <Notice tone="error" title="Backend indisponível">{capabilitiesError}</Notice>
        ) : null}

        {!runtimeConfig.isDemoMode && capabilities && !historicalAvailable ? (
          <Notice tone="warning" title="Coleta histórica ainda incompleta">
            O catálogo de usinas e o arquivo bruto da ONS estão {capabilities.data?.plantCatalog && capabilities.data?.onsRaw ? "disponíveis" : "pendentes"}, mas o snapshot unido ONS + ERA5 ainda não foi publicado. Execute o backfill ERA5 e o <code>join-ons</code> para liberar as estimativas reais.
          </Notice>
        ) : null}

        <section className="rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm sm:p-7">
          <div className="inline-flex w-full rounded-xl bg-surface-container-lowest p-1 sm:w-auto" role="tablist" aria-label="Fonte de dados climáticos">
            <button type="button" role="tab" aria-selected={source === "historical"} onClick={() => setSource("historical")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none ${source === "historical" ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:text-on-surface"}`}>
              <Icon name="database" className="h-4 w-4" /> Histórico
            </button>
            <button type="button" role="tab" aria-selected={source === "upload"} disabled={!uploadAvailable} onClick={() => setSource("upload")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none ${source === "upload" ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:text-on-surface"}`}>
              <Icon name="upload" className="h-4 w-4" /> Cenário próprio {!uploadAvailable ? "(em breve)" : ""}
            </button>
          </div>

          {source === "historical" ? (
            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
              <div className="space-y-5">
                <div>
                  <label className="field-label" htmlFor="subsystem">Subsistema</label>
                  <input id="subsystem" className="field-input" value="Nordeste (NE) — recorte do MVP" disabled readOnly />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="start-at">Início do período</label>
                    <input id="start-at" type="datetime-local" className="field-input" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="end-at">Fim do período</label>
                    <input id="end-at" type="datetime-local" className="field-input" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
                  </div>
                </div>
                {!isHistoricalRangeValid ? <p className="text-sm text-error">O término precisa ser posterior ao início.</p> : null}
                <div>
                  <label className="field-label" htmlFor="resolution">Resolução temporal</label>
                  <select id="resolution" className="field-input" value={resolutionMinutes} onChange={(event) => setResolutionMinutes(Number(event.target.value) as 30 | 60)}>
                    <option value={60}>1 hora — resolução nativa ERA5</option>
                    <option value={30} disabled={!runtimeConfig.isDemoMode}>30 minutos — ainda não integrado</option>
                  </select>
                  {resolutionMinutes === 30 ? <p className="mt-2 text-xs text-amber-200">A API deverá sinalizar a interpolação para atender à RN02.</p> : null}
                </div>
              </div>

              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5">
                <Icon name="database" className="h-6 w-6 text-secondary" />
                <h2 className="mt-3 font-semibold text-on-surface">Rastreabilidade da fonte</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Snapshot</dt><dd className="font-mono text-on-surface">{runtimeConfig.isDemoMode ? DEMO_SNAPSHOT_DATE : capabilities?.data?.snapshotDate ?? "pendente"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Clima</dt><dd className="text-right text-on-surface">ERA5, vento a 100 m</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Operação</dt><dd className="text-right text-on-surface">{capabilities?.data?.onsRaw || runtimeConfig.isDemoMode ? "ONS disponível" : "ONS pendente"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">ERA5 processado</dt><dd className="text-right text-on-surface">{runtimeConfig.isDemoMode ? "demonstração" : capabilities?.data?.era5Processed ? `${capabilities.data.era5PartitionCount} partição(ões)` : "pendente"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">Região</dt><dd className="text-on-surface">Nordeste</dd></div>
                </dl>
              </div>
            </div>
          ) : (
            <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div>
                <input ref={fileInputRef} id="climate-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
                <label htmlFor="climate-file" className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-secondary/50 bg-surface-container-lowest p-7 text-center transition-colors hover:border-secondary hover:bg-surface-container">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/10 text-secondary"><Icon name="upload" className="h-6 w-6" /></span>
                  <span className="mt-4 text-sm font-semibold text-on-surface">{file ? file.name : "Selecione um CSV ou XLSX"}</span>
                  <span className="mt-1 text-xs text-on-surface-variant">Máximo de 25 MB. CSV é validado localmente; XLSX será validado pela API.</span>
                </label>

                {file ? (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-container-high px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-on-surface">{file.name}</p>
                      <p className="text-xs text-outline">{(file.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB</p>
                    </div>
                    <button type="button" onClick={() => { void handleFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-variant hover:text-error" aria-label="Remover arquivo"><Icon name="trash" /></button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-on-surface">Validação do arquivo</h2>
                  <ValidationBadge status={validation.status} />
                </div>
                {validation.status === "idle" ? (
                  <p className="mt-4 text-sm leading-6 text-on-surface-variant">Após a seleção, verificamos tamanho, cabeçalhos e limites físicos básicos antes do envio.</p>
                ) : validation.status === "validating" ? (
                  <p className="mt-4 text-sm text-on-surface-variant">Lendo o arquivo…</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {validation.rowCount ? <p className="text-sm text-on-surface"><strong>{validation.rowCount.toLocaleString("pt-BR")}</strong> registros encontrados.</p> : null}
                    {validation.startAt && validation.endAt ? <p className="text-xs text-on-surface-variant">Período: {new Date(validation.startAt).toLocaleString("pt-BR")} — {new Date(validation.endAt).toLocaleString("pt-BR")}</p> : null}
                    {validation.issues.length > 0 ? (
                      <ul className="max-h-44 space-y-2 overflow-y-auto text-xs text-on-surface-variant">
                        {validation.issues.map((issue, index) => <li key={`${issue.row}-${issue.field}-${index}`} className="rounded-lg bg-surface-container p-2">{issue.row ? `Linha ${issue.row} · ` : ""}{issue.field ? `${issue.field}: ` : ""}{issue.message}</li>)}
                      </ul>
                    ) : <p className="text-sm text-emerald-200">Schema e limites físicos básicos aprovados.</p>}
                  </div>
                )}
                <div className="mt-5 border-t border-outline-variant/40 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">Colunas obrigatórias</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {climateFileSchema.required.map((column) => <code key={column} className="rounded bg-surface-container px-2 py-1 text-[10px] text-secondary">{column}</code>)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {error ? <Notice tone="error" title="Falha ao processar o cenário">{error}</Notice> : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={handleReset} className="button-secondary"><Icon name="refresh" /> Limpar cenário</button>
          <button type="button" onClick={() => void handleProcess()} disabled={!canProcess || isProcessing || isLoadingCapabilities} className="button-primary">
            {isProcessing ? "Processando…" : isLoadingCapabilities ? "Verificando dados…" : "Processar e estimar geração"}<Icon name="arrow-right" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function ValidationBadge({ status }: { status: FileValidationResult["status"] }) {
  const label = { idle: "Aguardando", validating: "Validando", valid: "Válido", invalid: "Inválido", "pending-backend": "Pendente da API" }[status];
  const classes = status === "valid" ? "bg-emerald-300/10 text-emerald-200" : status === "invalid" ? "bg-error/10 text-error" : status === "pending-backend" ? "bg-amber-300/10 text-amber-200" : "bg-surface-container text-on-surface-variant";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${classes}`}>{label}</span>;
}
