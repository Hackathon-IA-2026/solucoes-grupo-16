"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useScenario } from "@/context/scenario-context";
import { useSystemStatus } from "@/context/system-context";
import { climagridApi, runtimeConfig } from "@/lib/api";

const DEMO_TIMESTAMP = "2024-01-15T12:00";

export default function HistoricalReplayPage() {
  const router = useRouter();
  const { resetScenario, setProcessedScenario } = useScenario();
  const { capabilities, error: capabilitiesError } = useSystemStatus();
  const [selectedTimestamp, setSelectedTimestamp] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = capabilities?.data;
  const defaultTimestamp = runtimeConfig.isDemoMode
    ? DEMO_TIMESTAMP
    : toLocalDateTime(data?.historicalLatestTimestamp);
  const timestamp = selectedTimestamp || defaultTimestamp;
  const replayAvailable = runtimeConfig.isDemoMode || capabilities?.climate.historicalReplay === true;
  const canProcess = Boolean(timestamp && replayAvailable);

  async function handleReplay() {
    if (!canProcess) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await climagridApi.processScenario({
        source: "historical",
        timestamp,
        resolutionMinutes: 60,
      });
      setProcessedScenario(result.scenario, result.estimates);
      router.push("/usinas-estimativas");
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : "Não foi possível reproduzir o instante histórico.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function handleReset() {
    resetScenario();
    setSelectedTimestamp("");
    setError(null);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Etapa 1 de 4 · Replay histórico"
          title="Escolha uma hora já observada"
          description="O ClimaGrid recupera a geração realmente registrada pela ONS e o vento ERA5 da mesma hora para os conjuntos eólicos do Nordeste. Nenhuma previsão de IA é usada nesta etapa."
          aside={
            <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">Modo ativo</p>
              <p className="mt-1 text-sm font-semibold text-secondary">Geração observada</p>
            </div>
          }
        />

        {runtimeConfig.isDemoMode ? (
          <Notice tone="warning" title="Demonstração local">
            A API não está configurada. O fluxo pode ser navegado, mas os valores apresentados serão fictícios.
          </Notice>
        ) : null}

        {!runtimeConfig.isDemoMode && capabilitiesError ? (
          <Notice tone="error" title="Backend indisponível">{capabilitiesError}</Notice>
        ) : null}

        {!runtimeConfig.isDemoMode && capabilities && !replayAvailable ? (
          <Notice tone="warning" title="Base histórica ainda indisponível">
            O snapshot observado ONS + ERA5 ainda não foi publicado. Conclua a ingestão e a união dos dados para liberar o replay.
          </Notice>
        ) : null}

        <section className="grid gap-6 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)] lg:p-7">
          <div className="space-y-5">
            <div>
              <label className="field-label" htmlFor="subsystem">Subsistema</label>
              <input id="subsystem" className="field-input" value="Nordeste (NE) — recorte do MVP" disabled readOnly />
            </div>
            <div>
              <label className="field-label" htmlFor="historical-timestamp">Instante histórico</label>
              <input
                id="historical-timestamp"
                type="datetime-local"
                step={3600}
                min={toLocalDateTime(data?.historicalFirstTimestamp)}
                max={toLocalDateTime(data?.historicalLastTimestamp)}
                className="field-input"
                value={timestamp}
                onChange={(event) => setSelectedTimestamp(event.target.value)}
              />
              <p className="mt-2 text-xs text-on-surface-variant">
                Horário local do navegador. A consulta é convertida para UTC e deve coincidir com uma hora disponível no snapshot.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" disabled={!canProcess || isProcessing} onClick={() => void handleReplay()} className="button-primary">
                <Icon name="database" /> {isProcessing ? "Carregando observações…" : "Reproduzir esta hora"}
              </button>
              <button type="button" onClick={handleReset} className="button-secondary">Limpar estudo</button>
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5">
            <Icon name="database" className="h-6 w-6 text-secondary" />
            <h2 className="mt-3 font-semibold text-on-surface">Cobertura disponível</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Trace label="Geração" value="ONS · valor verificado" />
              <Trace label="Vento" value="ERA5 · 100 metros" />
              <Trace label="Resolução" value="1 hora" />
              <Trace label="Primeira hora" value={formatTimestamp(data?.historicalFirstTimestamp)} />
              <Trace label="Última hora" value={formatTimestamp(data?.historicalLastTimestamp)} />
              <Trace label="Horas disponíveis" value={data?.historicalInstantCount?.toLocaleString("pt-BR") ?? (runtimeConfig.isDemoMode ? "demonstração" : "—")} />
            </dl>
          </div>
        </section>

        {error ? <Notice tone="error" title="Replay não concluído">{error}</Notice> : null}

        <Notice title="O que será levado ao PWF">
          Após selecionar as usinas e associá-las às barras, o sistema escreverá no campo Pg exatamente a geração observada nesta hora, preservando os demais blocos do caso base.
        </Notice>
      </div>
    </AppShell>
  );
}

function toLocalDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatTimestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function Trace({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">{label}</dt><dd className="text-right text-on-surface">{value}</dd></div>;
}
