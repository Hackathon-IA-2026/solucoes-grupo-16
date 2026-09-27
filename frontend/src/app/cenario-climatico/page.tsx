"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { useScenario } from "@/context/scenario-context";
import { useSystemStatus } from "@/context/system-context";
import { climagridApi, runtimeConfig } from "@/lib/api";
import type { ClimateFileInspection } from "@/types/climagrid";

type ClimateInputMode = "era5" | "csv";

export default function ClimateFilePage() {
  const router = useRouter();
  const { setProcessedScenario } = useScenario();
  const { capabilities } = useSystemStatus();
  const [mode, setMode] = useState<ClimateInputMode>("era5");
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ClimateFileInspection | null>(null);
  const [timestamp, setTimestamp] = useState("");
  const [era5Timestamp, setEra5Timestamp] = useState("");
  const [availability, setAvailability] = useState("1");
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState<"inspect" | "csv" | "era5" | null>(null);
  const [loadingDismissed, setLoadingDismissed] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const csvAvailable = !runtimeConfig.isDemoMode && capabilities?.climate.fileUpload === true;
  const era5Available = !runtimeConfig.isDemoMode && capabilities?.climate.era5Scenario === true;
  const selectedEra5Timestamp = era5Timestamp || toLocalDateTime(capabilities?.data?.historicalLatestTimestamp);
  const availabilityValue = Number(availability);
  const validAvailability = Number.isFinite(availabilityValue)
    && availabilityValue >= 0
    && availabilityValue <= 1;

  async function inspect(selected: File | null) {
    setFile(selected);
    setInspection(null);
    setTimestamp("");
    setError(null);
    if (!selected) return;
    setBusy(true);
    setBusyKind("inspect");
    setLoadingDismissed(false);
    setProgressMessage("Lendo a estrutura e validando as colunas do CSV…");
    try {
      const result = await climagridApi.inspectClimateFile(selected);
      setInspection(result);
      setTimestamp(result.timestamps[0] ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível validar o CSV.");
    } finally {
      setBusy(false);
      setBusyKind(null);
    }
  }

  async function processCsv() {
    if (!file || !timestamp || !inspection) return;
    setBusy(true);
    setBusyKind("csv");
    setLoadingDismissed(false);
    setProgressMessage("Validando o arquivo climático selecionado…");
    setError(null);
    try {
      const result = await climagridApi.processScenario({
        source: "upload", file, timestamp, resolutionMinutes: 60, onProgress: setProgressMessage,
      });
      setProcessedScenario(result.scenario, result.estimates);
      router.push("/usinas-estimativas");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível estimar o cenário.");
    } finally {
      setBusy(false);
      setBusyKind(null);
    }
  }

  async function processEra5() {
    if (!selectedEra5Timestamp || !validAvailability) return;
    setBusy(true);
    setBusyKind("era5");
    setLoadingDismissed(false);
    setProgressMessage("Consultando o cache climático para a hora selecionada…");
    setError(null);
    try {
      const result = await climagridApi.processScenario({
        source: "era5",
        timestamp: selectedEra5Timestamp,
        resolutionMinutes: 60,
        availability: availabilityValue,
        onProgress: setProgressMessage,
      });
      setProcessedScenario(result.scenario, result.estimates);
      router.push("/usinas-estimativas");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar o cenário ERA5.");
    } finally {
      setBusy(false);
      setBusyKind(null);
    }
  }

  function selectMode(nextMode: ClimateInputMode) {
    setMode(nextMode);
    setError(null);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <ProcessingOverlay
          key={busyKind}
          open={busy && !loadingDismissed}
          title={busyKind === "inspect" ? "Validando o arquivo climático" : busyKind === "csv" ? "Estimando o cenário do CSV" : "Preparando o cenário ERA5"}
          message={progressMessage}
          steps={busyKind === "era5" ? [
            progressMessage,
            "Conectando ao Copernicus Climate Data Store…",
            "Extraindo o vento ERA5 para os conjuntos cadastrados…",
            "Calculando o potencial e registrando a proveniência…",
          ] : busyKind === "csv" ? [
            progressMessage,
            "Conciliando os identificadores com o catálogo por CEG…",
            "Aplicando a curva física e a disponibilidade informada…",
            "Persistindo o cenário e sua rastreabilidade…",
          ] : [progressMessage, "Conferindo timestamps, unidades e duplicidades…"]}
          onDismiss={() => setLoadingDismissed(true)}
        />
        <PageHeader
          eyebrow="Etapa 2 do MVP · Cenário climático"
          title="Escolha a origem do vento"
          description="Use uma hora histórica do Copernicus ERA5 ou envie seu próprio CSV. Em ambos os casos, o ClimaGrid estima o potencial eólico e prepara um PWF daquela hora."
        />
        <Notice
          tone="warning"
          title={capabilities?.model?.approved
            ? `LightGBM experimental ativo · ${capabilities.model.version}`
            : "Curva física de fallback ativa"}
        >
          O resultado não é geração observada nem previsão meteorológica. O LightGBM é usado nas linhas elegíveis; entradas incompatíveis permanecem identificadas como fallback físico. Revise o cenário antes do uso no ANAREDE.
        </Notice>
        {runtimeConfig.isDemoMode ? (
          <Notice tone="error" title="API necessária">
            Configure a API para buscar o ERA5 ou enviar um CSV real. Este fluxo não usa dados fictícios.
          </Notice>
        ) : null}

        <section className="space-y-5 rounded-3xl border border-secondary/20 bg-gradient-to-br from-surface-container-low to-surface-container-lowest p-6 shadow-xl shadow-black/10 sm:p-7">
          <div className="flex flex-wrap gap-3" role="group" aria-label="Origem dos dados climáticos">
            <button type="button" className={mode === "era5" ? "button-primary" : "button-secondary"} onClick={() => selectMode("era5")}>
              Buscar no Copernicus ERA5
            </button>
            <button type="button" className={mode === "csv" ? "button-primary" : "button-secondary"} onClick={() => selectMode("csv")}>
              Enviar CSV próprio
            </button>
          </div>

          {mode === "era5" ? (
            <div className="space-y-5">
              <div>
                <h2 className="font-semibold">Clima histórico do ERA5</h2>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Escolha uma hora já encerrada. Se o mês ainda não estiver no cache, o servidor fará o download e o processamento em segundo plano. ERA5 é reanálise histórica, não previsão futura.
                </p>
              </div>
              {!runtimeConfig.isDemoMode && capabilities && !era5Available ? (
                <Notice tone="error" title="ERA5 indisponível">
                  Não há partições ERA5 em cache nem credencial CDS configurada no serviço de IA.
                </Notice>
              ) : null}
              <div>
                <label className="field-label" htmlFor="era5-timestamp">Instante histórico</label>
                <input
                  id="era5-timestamp"
                  type="datetime-local"
                  step={3600}
                  className="field-input"
                  value={selectedEra5Timestamp}
                  disabled={!era5Available || busy}
                  onChange={(event) => setEra5Timestamp(event.target.value)}
                />
                <p className="mt-2 text-xs text-on-surface-variant">
                  O horário local do navegador será convertido para UTC antes da consulta.
                </p>
              </div>
              <div>
                <label className="field-label" htmlFor="era5-availability">Disponibilidade aplicada a todos os conjuntos</label>
                <input
                  id="era5-availability"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  className="field-input"
                  value={availability}
                  disabled={!era5Available || busy}
                  onChange={(event) => setAvailability(event.target.value)}
                />
                <p className="mt-2 text-xs text-on-surface-variant">
                  Use uma fração entre 0 e 1. Este valor não vem do ERA5 e será registrado como hipótese do usuário.
                </p>
              </div>
              <button
                type="button"
                className="button-primary"
                disabled={!era5Available || !selectedEra5Timestamp || !validAvailability || busy}
                onClick={() => void processEra5()}
              >
                {busy ? "Baixando e processando ERA5…" : "Obter vento e estimar potencial"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="font-semibold">CSV climático próprio</h2>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Uma linha por conjunto ONS e hora. Use UTF-8, horas ISO 8601 com timezone, <code>u100</code> e <code>v100</code> em m/s e disponibilidade entre 0 e 1. Temperatura em K e pressão em Pa são opcionais.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-container-lowest p-3 text-xs">{"timestamp_utc,usina_id,u100,v100,disponibilidade\n2024-01-15T12:00:00Z,CJU_RNCAJ1,7.2,-3.1,0.95"}</pre>
              </div>
              {!runtimeConfig.isDemoMode && capabilities && !csvAvailable ? (
                <Notice tone="error" title="Cadastro indisponível">
                  O serviço ainda não possui um catálogo de usinas pronto para estimar este cenário.
                </Notice>
              ) : null}
              <div>
                <label className="field-label" htmlFor="climate-csv">Arquivo climático (.csv, até 5 MB)</label>
                <input id="climate-csv" type="file" accept=".csv,text/csv" disabled={!csvAvailable || busy} className="field-input" onChange={(event) => void inspect(event.target.files?.[0] ?? null)} />
              </div>
              {inspection ? (
                <div className="space-y-3">
                  <p className="text-sm text-on-surface-variant">
                    {inspection.rowCount} linhas, {inspection.plantCount} conjuntos e {inspection.timestamps.length} horas validadas.
                  </p>
                  <div>
                    <label className="field-label" htmlFor="scenario-hour">Hora do PWF</label>
                    <select id="scenario-hour" className="field-input" value={timestamp} onChange={(event) => setTimestamp(event.target.value)}>
                      {inspection.timestamps.map((item) => (
                        <option key={item} value={item}>{new Date(item).toLocaleString("pt-BR")} ({item})</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}
              <button type="button" className="button-primary" disabled={!csvAvailable || !inspection || !timestamp || busy} onClick={() => void processCsv()}>
                {busy ? "Processando…" : "Estimar e revisar usinas"}
              </button>
            </div>
          )}

          {error ? <Notice tone="error" title="Cenário não processado">{error}</Notice> : null}
          <div><Link href="/" className="button-secondary">Voltar ao replay</Link></div>
        </section>
      </div>
    </AppShell>
  );
}

function toLocalDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
