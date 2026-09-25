"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useScenario } from "@/context/scenario-context";
import { useSystemStatus } from "@/context/system-context";
import { climagridApi, runtimeConfig } from "@/lib/api";
import type { ClimateFileInspection } from "@/types/climagrid";

export default function ClimateFilePage() {
  const router = useRouter();
  const { setProcessedScenario } = useScenario();
  const { capabilities } = useSystemStatus();
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ClimateFileInspection | null>(null);
  const [timestamp, setTimestamp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = !runtimeConfig.isDemoMode && capabilities?.climate.fileUpload === true;

  async function inspect(selected: File | null) {
    setFile(selected);
    setInspection(null);
    setTimestamp("");
    setError(null);
    if (!selected) return;
    setBusy(true);
    try {
      const result = await climagridApi.inspectClimateFile(selected);
      setInspection(result);
      setTimestamp(result.timestamps[0] ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível validar o CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function process() {
    if (!file || !timestamp || !inspection) return;
    setBusy(true);
    setError(null);
    try {
      const result = await climagridApi.processScenario({
        source: "upload", file, timestamp, resolutionMinutes: 60,
      });
      setProcessedScenario(result.scenario, result.estimates);
      router.push("/usinas-estimativas");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível estimar o cenário.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader eyebrow="Etapa 2 do MVP · Cenário climático" title="Envie o vento de uma hora"
          description="O ClimaGrid estima o potencial eólico com uma curva física. O arquivo informa o vento e a disponibilidade de cada conjunto; o resultado será usado para preparar um PWF daquela hora." />
        <Notice tone="warning" title="Estimativa física, ainda sem modelo de IA validado">
          Esta estimativa não é geração observada nem previsão meteorológica. A curva é genérica e deve ser revisada pelo especialista antes do uso no ANAREDE.
        </Notice>
        {!runtimeConfig.isDemoMode && capabilities && !available ? <Notice tone="error" title="Cadastro indisponível">O serviço ainda não possui um catálogo de usinas pronto para estimar este cenário.</Notice> : null}
        {runtimeConfig.isDemoMode ? <Notice tone="error" title="API necessária">Configure a API para enviar um CSV real. Este fluxo não usa dados fictícios.</Notice> : null}
        <section className="space-y-5 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-6">
          <div>
            <h2 className="font-semibold">Formato do CSV</h2>
            <p className="mt-2 text-sm text-on-surface-variant">Uma linha por conjunto ONS e hora. Use UTF-8, horas ISO 8601 com timezone, <code>u100</code> e <code>v100</code> em m/s e disponibilidade entre 0 e 1. Temperatura em K e pressão em Pa são opcionais.</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-container-lowest p-3 text-xs">{"timestamp_utc,usina_id,u100,v100,disponibilidade\n2024-01-15T12:00:00Z,CJU_RNCAJ1,7.2,-3.1,0.95"}</pre>
          </div>
          <div>
            <label className="field-label" htmlFor="climate-csv">Arquivo climático (.csv, até 5 MB)</label>
            <input id="climate-csv" type="file" accept=".csv,text/csv" disabled={!available || busy}
              className="field-input" onChange={(event) => void inspect(event.target.files?.[0] ?? null)} />
          </div>
          {inspection ? <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">{inspection.rowCount} linhas, {inspection.plantCount} conjuntos e {inspection.timestamps.length} horas validadas.</p>
            <div><label className="field-label" htmlFor="scenario-hour">Hora do PWF</label>
              <select id="scenario-hour" className="field-input" value={timestamp} onChange={(event) => setTimestamp(event.target.value)}>
                {inspection.timestamps.map((item) => <option key={item} value={item}>{new Date(item).toLocaleString("pt-BR")} ({item})</option>)}
              </select></div>
          </div> : null}
          {error ? <Notice tone="error" title="Cenário não processado">{error}</Notice> : null}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="button-primary" disabled={!available || !inspection || !timestamp || busy}
              onClick={() => void process()}>{busy ? "Processando…" : "Estimar e revisar usinas"}</button>
            <Link href="/" className="button-secondary">Voltar ao replay</Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
