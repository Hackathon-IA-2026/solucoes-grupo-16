"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useScenario } from "@/context/scenario-context";
import { climagridApi, runtimeConfig } from "@/lib/api";
import { climateFileSchema, validateClimateFile } from "@/lib/file-validation";
import { DEMO_SNAPSHOT_DATE } from "@/lib/mock-data";
import type { ClimateSource, FileValidationResult } from "@/types/climagrid";

const emptyValidation: FileValidationResult = { status: "idle", issues: [] };

export default function ClimateInputPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { resetScenario, setProcessedScenario } = useScenario();
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
  const canProcess = source === "historical" ? isHistoricalRangeValid : isUploadReady;

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
            <div className="rounded-lg border border-neutral-900/50 bg-card-bg px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Fonte ativa</p>
              <p className="mt-1 text-sm font-semibold text-accent-blue">{source === "historical" ? "Histórico ERA5 + ONS" : "Arquivo do usuário"}</p>
            </div>
          }
        />

        {runtimeConfig.isDemoMode ? (
          <Notice tone="warning" title="Dados demonstrativos">
            A API ainda não está configurada. Ao processar, o frontend usará uma amostra fictícia para validar a jornada. Nenhum valor deve ser usado em estudo elétrico.
          </Notice>
        ) : null}

        <section className="rounded-2xl border border-neutral-900/50 bg-sidebar-bg p-5 shadow-card sm:p-7">
          <div className="inline-flex w-full overflow-hidden rounded-xl bg-card-bg sm:w-auto" role="tablist" aria-label="Fonte de dados climáticos">
            <button type="button" role="tab" aria-selected={source === "historical"} onClick={() => setSource("historical")} className={`flex flex-1 items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium transition-all duration-300 ease-out sm:flex-none sm:min-w-[160px] ${source === "historical" ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-neutral-900 hover:text-text-primary"}`}>
              <Icon name="database" className="h-4 w-4" /> Histórico
            </button>
            <button type="button" role="tab" aria-selected={source === "upload"} onClick={() => setSource("upload")} className={`flex flex-1 items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium transition-all duration-300 ease-out sm:flex-none sm:min-w-[160px] ${source === "upload" ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20" : "text-text-secondary hover:bg-neutral-900 hover:text-text-primary"}`}>
              <Icon name="upload" className="h-4 w-4" /> Cenário próprio
            </button>
          </div>

          {source === "historical" ? (
            <div className="animate-fade-in mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
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
                {!isHistoricalRangeValid ? <p className="text-sm text-overdue">O término precisa ser posterior ao início.</p> : null}
                <div>
                  <label className="field-label" htmlFor="resolution">Resolução temporal</label>
                  <select id="resolution" className="field-input" value={resolutionMinutes} onChange={(event) => setResolutionMinutes(Number(event.target.value) as 30 | 60)}>
                    <option value={60}>1 hora — resolução nativa ERA5</option>
                    <option value={30}>30 minutos — requer reamostragem</option>
                  </select>
                  {resolutionMinutes === 30 ? <p className="mt-2 text-xs text-yellow-500">A API deverá sinalizar a interpolação para atender à RN02.</p> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-900/40 bg-card-bg p-5">
                <Icon name="database" className="h-6 w-6 text-accent-blue" />
                <h2 className="mt-3 font-semibold text-text-primary">Rastreabilidade da fonte</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-text-secondary">Snapshot</dt><dd className="font-mono text-text-primary">{runtimeConfig.isDemoMode ? DEMO_SNAPSHOT_DATE : "informado pela API"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-text-secondary">Clima</dt><dd className="text-right text-text-primary">ERA5, vento a 100 m</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-text-secondary">Operação</dt><dd className="text-right text-text-primary">ONS constrained-off</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-text-secondary">Região</dt><dd className="text-text-primary">Nordeste</dd></div>
                </dl>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div>
                <input ref={fileInputRef} id="climate-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
                <label htmlFor="climate-file" className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-accent-blue/50 bg-card-bg p-7 text-center transition-colors hover:border-accent-blue hover:bg-neutral-900">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-blue/10 text-accent-blue"><Icon name="upload" className="h-6 w-6" /></span>
                  <span className="mt-4 text-sm font-semibold text-text-primary">{file ? file.name : "Selecione um CSV ou XLSX"}</span>
                  <span className="mt-1 text-xs text-text-secondary">Máximo de 25 MB. CSV é validado localmente; XLSX será validado pela API.</span>
                </label>

                {file ? (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-neutral-800 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
                      <p className="text-xs text-text-muted">{(file.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB</p>
                    </div>
                    <button type="button" onClick={() => { void handleFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="rounded-lg p-2 text-text-secondary hover:bg-neutral-800 hover:text-overdue" aria-label="Remover arquivo"><Icon name="trash" /></button>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-neutral-900/40 bg-card-bg p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-text-primary">Validação do arquivo</h2>
                  <ValidationBadge status={validation.status} />
                </div>
                {validation.status === "idle" ? (
                  <p className="mt-4 text-sm leading-6 text-text-secondary">Após a seleção, verificamos tamanho, cabeçalhos e limites físicos básicos antes do envio.</p>
                ) : validation.status === "validating" ? (
                  <p className="mt-4 text-sm text-text-secondary">Lendo o arquivo…</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {validation.rowCount ? <p className="text-sm text-text-primary"><strong>{validation.rowCount.toLocaleString("pt-BR")}</strong> registros encontrados.</p> : null}
                    {validation.startAt && validation.endAt ? <p className="text-xs text-text-secondary">Período: {new Date(validation.startAt).toLocaleString("pt-BR")} — {new Date(validation.endAt).toLocaleString("pt-BR")}</p> : null}
                    {validation.issues.length > 0 ? (
                      <ul className="max-h-44 space-y-2 overflow-y-auto text-xs text-text-secondary">
                        {validation.issues.map((issue, index) => <li key={`${issue.row}-${issue.field}-${index}`} className="rounded-lg bg-neutral-900 p-2">{issue.row ? `Linha ${issue.row} · ` : ""}{issue.field ? `${issue.field}: ` : ""}{issue.message}</li>)}
                      </ul>
                    ) : <p className="text-sm text-paid">Schema e limites físicos básicos aprovados.</p>}
                  </div>
                )}
                <div className="mt-5 border-t border-neutral-900/40 pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Colunas obrigatórias</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {climateFileSchema.required.map((column) => <code key={column} className="rounded bg-neutral-900 px-2 py-1 text-[10px] text-accent-blue">{column}</code>)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {error ? <Notice tone="error" title="Falha ao processar o cenário">{error}</Notice> : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={handleReset} className="button-secondary"><Icon name="refresh" /> Limpar cenário</button>
          <button type="button" onClick={() => void handleProcess()} disabled={!canProcess || isProcessing} className="button-primary">
            {isProcessing ? "Processando…" : "Processar e estimar geração"}<Icon name="arrow-right" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function ValidationBadge({ status }: { status: FileValidationResult["status"] }) {
  const label = { idle: "Aguardando", validating: "Validando", valid: "Válido", invalid: "Inválido", "pending-backend": "Pendente da API" }[status];
  const classes = status === "valid" ? "bg-paid/10 text-paid" : status === "invalid" ? "bg-overdue/10 text-overdue" : status === "pending-backend" ? "bg-yellow-500/10 text-yellow-500" : "bg-neutral-900 text-text-secondary";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${classes}`}>{label}</span>;
}
