"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
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
  const [loadingDismissed, setLoadingDismissed] = useState(false);
  const [progressMessage, setProgressMessage] = useState("Consultando as horas armazenadas…");
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
    setLoadingDismissed(false);
    setProgressMessage("Consultando as horas armazenadas…");
    setError(null);
    try {
      const result = await climagridApi.processScenario({
        source: "historical",
        timestamp,
        resolutionMinutes: 60,
        onProgress: setProgressMessage,
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
        <ProcessingOverlay
          open={isProcessing && !loadingDismissed}
          title="Preparando o replay histórico"
          message={progressMessage}
          steps={[
            progressMessage,
            "Conferindo a geração horária verificada da ONS…",
            "Localizando o vento ERA5 do mesmo instante…",
            "Conciliando conjuntos eólicos por CEG…",
          ]}
          onDismiss={() => setLoadingDismissed(true)}
        />

        <section className="relative overflow-hidden rounded-3xl border border-secondary/25 bg-gradient-to-br from-primary-container/30 via-surface-container-low to-tertiary-container/15 p-6 shadow-2xl shadow-black/15 sm:p-8">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-secondary/10 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <span className="inline-flex rounded-full border border-secondary/25 bg-secondary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Funcionalidade principal · Etapa 2 do MVP</span>
              <h1 className="mt-4 max-w-3xl text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">Transforme uma condição climática em um cenário PWF rastreável</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant">Use uma hora histórica do Copernicus ERA5 ou envie seu próprio CSV, estime o potencial eólico, revise as usinas e prepare uma exportação PWF rastreável.</p>
            </div>
            <Link href="/cenario-climatico" className="button-primary shrink-0"><Icon name="wind" /> Criar cenário climático <Icon name="arrow-right" /></Link>
          </div>
        </section>

        <PageHeader
          eyebrow="Etapa 1 de 4 · Replay histórico"
          title="Ou reproduza uma hora já observada"
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
            Não há horas em cache nem credenciais CDS configuradas para buscar o ERA5 histórico.
          </Notice>
        ) : null}

        {!runtimeConfig.isDemoMode && capabilities && replayAvailable && !capabilities.climate.historicalOnDemand ? (
          <Notice tone="warning" title="Coleta sob demanda indisponível">
            As horas já armazenadas podem ser reproduzidas. Para outras datas, configure a credencial CDS no AI service.
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
                className="field-input"
                value={timestamp}
                onChange={(event) => setSelectedTimestamp(event.target.value)}
              />
              <p className="mt-2 text-xs text-on-surface-variant">
                Horário local do navegador. A consulta é convertida para UTC. Se a hora ainda não estiver no cache, o sistema baixa os meses ONS e ERA5 necessários e concilia os dados; o primeiro acesso pode levar alguns minutos.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" disabled={!canProcess || isProcessing} onClick={() => void handleReplay()} className="button-primary">
                <Icon name="database" /> {isProcessing ? "Coletando e cruzando dados…" : "Reproduzir esta hora"}
              </button>
              <button type="button" onClick={handleReset} className="button-secondary">Limpar estudo</button>
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5">
            <Icon name="database" className="h-6 w-6 text-secondary" />
            <h2 className="mt-3 font-semibold text-on-surface">Horas já armazenadas</h2>
            <p className="mt-2 text-xs leading-5 text-on-surface-variant">Cada hora combina geração verificada da ONS com vento de reanálise do ERA5 no mesmo instante.</p>
            <dl className="mt-4 space-y-3 text-sm">
              <Trace label="Geração" value="ONS · valor verificado" />
              <Trace label="Vento" value="ERA5 · 100 metros" />
              <Trace label="Resolução" value="1 hora" />
              <Trace label="Primeira em cache" value={formatTimestamp(data?.historicalFirstTimestamp)} />
              <Trace label="Última em cache" value={formatTimestamp(data?.historicalLastTimestamp)} />
              <Trace label="Horas em cache" value={data?.historicalInstantCount?.toLocaleString("pt-BR") ?? (runtimeConfig.isDemoMode ? "demonstração" : "—")} />
            </dl>
            <div className="mt-5 flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/8 p-3 text-xs leading-5 text-amber-100">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Fora do cache, o sistema buscará novos dados ONS e ERA5. A primeira consulta pode levar alguns minutos.</p>
            </div>
          </div>
        </section>

        {error ? <Notice tone="error" title="Replay não concluído">{error}</Notice> : null}

        <Notice title="O que será levado ao PWF">
          Após selecionar as usinas e associá-las às barras, você poderá aplicar Operação, Estado e o Pg observado a um caso-base rastreável ou gerar somente o bloco DBAR de alterações.
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
