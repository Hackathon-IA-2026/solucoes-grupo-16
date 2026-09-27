"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { climagridApi } from "@/lib/api";
import type { ExperimentalInsights, ExperimentalMetric } from "@/types/climagrid";

const MODEL_LABELS = {
  physical: "Curva física",
  lightgbm: "LightGBM fixo",
  dml: "DML · densidade do ar",
} as const;

export default function ExperimentalInsightsPage() {
  const [report, setReport] = useState<ExperimentalInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    climagridApi.getExperimentalInsights()
      .then((result) => active && setReport(result))
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar o relatório.");
      });
    return () => { active = false; };
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Laboratório · trilha experimental"
          title="O que o DML acrescenta à curva física?"
          description="Comparação temporal pareada entre a curva física, um LightGBM residual fixo e o challenger DML. Esta tela gera evidência para o pitch; ela não altera a geração usada no PWF."
          aside={<StatusBadge available={report?.available === true} loading={!report && !error} />}
        />

        <Notice tone="warning" title="Resultado exploratório, não homologado">
          A geração operacional continua vindo da curva física. O target ONS usado aqui é uma proxy de geração sem limitação e ainda requer validação de domínio antes de qualquer promoção do modelo.
        </Notice>

        {error ? <Notice tone="error" title="Relatório indisponível">{error}</Notice> : null}
        {!report && !error ? <LoadingPanel /> : null}
        {report && !report.available ? (
          <Notice title="Experimento ainda não materializado">{report.message}</Notice>
        ) : null}
        {report?.available && report.overall_metrics && report.comparison ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Linhas pareadas" value={formatInteger(report.comparison.rows)} detail={`${formatInteger(report.comparison.hours)} horas`} />
              <SummaryCard label="Conjuntos ONS" value={formatInteger(report.comparison.plants)} detail="mesmas linhas nos 3 modelos" />
              <SummaryCard
                label="MAE DML"
                value={formatMw(report.overall_metrics.dml.mae_mw)}
                detail={`${formatGain(report.overall_metrics.dml.mae_gain_vs_physical)} · ${formatGain(report.overall_metrics.dml.mae_gain_vs_lightgbm, "LightGBM")}`}
              />
              <SummaryCard
                label="Cobertura do challenger"
                value={report.coverage ? formatPercent(report.coverage.model_fraction) : "—"}
                detail={report.coverage ? `${formatInteger(report.coverage.fallback_rows)} linhas em fallback` : "cobertura não informada"}
              />
            </section>

            <section className="rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 lg:p-7">
              <SectionTitle title="Comparação geral" description="Todos os modelos são medidos sobre exatamente as mesmas horas futuras de cada corte temporal." />
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {(Object.keys(MODEL_LABELS) as Array<keyof typeof MODEL_LABELS>).map((model) => (
                  <MetricCard key={model} label={MODEL_LABELS[model]} metric={report.overall_metrics![model]} highlighted={model === "dml"} />
                ))}
              </div>
            </section>

            {report.charts?.fold_performance.length ? (
              <section className="rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 lg:p-7">
                <SectionTitle title="MAE por corte temporal" description="A consistência entre folds é mais importante para o pitch do que um único número agregado." />
                <div className="mt-6 space-y-5">
                  {report.charts.fold_performance.map((fold) => (
                    <FoldBars key={fold.fold_id} fold={fold} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
              <DataTable
                title="Desempenho por faixa de vento"
                description="Revela onde o challenger ajuda ou piora a curva física."
                headers={["Faixa", "Curva", "LightGBM", "DML", "n"]}
                rows={(report.charts?.wind_performance ?? []).map((row) => [
                  `${row.label} m/s`, formatMw(row.physical_mae_mw), formatMw(row.lightgbm_mae_mw),
                  formatMw(row.dml_mae_mw), formatInteger(row.rows),
                ])}
              />
              <DataTable
                title="Sinal associado à densidade do ar"
                description="Correção média aprendida pelo DML em cada faixa observada de densidade."
                headers={["ρ médio", "Erro físico", "Correção DML", "n"]}
                rows={(report.charts?.density_response ?? []).map((row) => [
                  `${row.density.toFixed(3)} kg/m³`, formatSignedMw(row.physical_error_mw),
                  formatSignedMw(row.dml_correction_mw), formatInteger(row.rows),
                ])}
              />
            </section>

            <section className="rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 lg:p-7">
              <SectionTitle title="Rastreabilidade e limites" description="Os hashes tornam a comparação reproduzível; as ressalvas impedem que evidência de hackathon vire promessa operacional." />
              <dl className="mt-5 grid gap-3 text-xs lg:grid-cols-2">
                <HashRow label="Comparação" value={report.comparison.comparison_sha256} />
                <HashRow label="Estimando" value={report.estimand_sha256} />
                <HashRow label="Entrada" value={report.input_sha256} />
                <HashRow label="Predições" value={report.predictions_sha256} />
              </dl>
              <ul className="mt-5 space-y-2 text-sm text-on-surface-variant">
                {(report.limitations ?? []).map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function StatusBadge({ available, loading }: { available: boolean; loading: boolean }) {
  return <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-outline">Estado</p>
    <p className={`mt-1 text-sm font-semibold ${available ? "text-amber-200" : "text-on-surface-variant"}`}>
      {loading ? "Carregando" : available ? "Evidência exploratória" : "Não materializado"}
    </p>
  </div>;
}

function LoadingPanel() {
  return <div className="animate-pulse rounded-2xl border border-outline-variant/50 bg-surface-container-low p-8 text-sm text-outline">Carregando comparação temporal…</div>;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-outline-variant/50 bg-surface-container-low p-5">
    <p className="text-xs font-medium text-on-surface-variant">{label}</p>
    <p className="mt-2 font-mono text-2xl font-semibold text-on-surface">{value}</p>
    <p className="mt-1 text-xs text-outline">{detail}</p>
  </div>;
}

function MetricCard({ label, metric, highlighted }: { label: string; metric: ExperimentalMetric; highlighted?: boolean }) {
  return <div className={`rounded-xl border p-5 ${highlighted ? "border-secondary/50 bg-secondary/8" : "border-outline-variant/40 bg-surface-container-lowest"}`}>
    <p className="text-sm font-semibold text-on-surface">{label}</p>
    <dl className="mt-4 space-y-2 text-sm">
      <MetricRow label="MAE" value={formatMw(metric.mae_mw)} />
      <MetricRow label="RMSE" value={formatMw(metric.rmse_mw)} />
      <MetricRow label="Viés" value={formatSignedMw(metric.bias_mw)} />
      <MetricRow label="WAPE" value={formatPercent(metric.wape)} />
    </dl>
  </div>;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-on-surface-variant">{label}</dt><dd className="font-mono text-on-surface">{value}</dd></div>;
}

function FoldBars({ fold }: { fold: NonNullable<ExperimentalInsights["charts"]>["fold_performance"][number] }) {
  const values = [fold.physical_mae_mw, fold.lightgbm_mae_mw, fold.dml_mae_mw];
  const maximum = Math.max(...values, 0.001);
  const rows = [
    ["Curva física", fold.physical_mae_mw, "bg-outline"],
    ["LightGBM", fold.lightgbm_mae_mw, "bg-primary"],
    ["DML", fold.dml_mae_mw, "bg-secondary"],
  ] as const;
  return <div>
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-outline">Fold {fold.fold_id}</p>
    <div className="space-y-2">
      {rows.map(([label, value, color]) => <div key={label} className="grid grid-cols-[84px_1fr_72px] items-center gap-3 text-xs">
        <span className="text-on-surface-variant">{label}</span>
        <span className="h-2 overflow-hidden rounded-full bg-surface-container-highest"><span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(2, value / maximum * 100)}%` }} /></span>
        <span className="text-right font-mono text-on-surface">{formatMw(value)}</span>
      </div>)}
    </div>
  </div>;
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-lg font-semibold text-on-surface">{title}</h2><p className="mt-1 text-sm text-on-surface-variant">{description}</p></div>;
}

function DataTable({ title, description, headers, rows }: { title: string; description: string; headers: string[]; rows: string[][] }) {
  return <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 lg:p-7">
    <SectionTitle title={title} description={description} />
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[460px] text-left text-xs">
        <thead className="text-outline"><tr>{headers.map((header) => <th key={header} className="border-b border-outline-variant/50 px-2 py-2 font-medium">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="text-on-surface-variant">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="border-b border-outline-variant/25 px-2 py-2.5 font-mono">{cell}</td>)}</tr>)}</tbody>
      </table>
      {!rows.length ? <p className="py-5 text-center text-sm text-outline">Sem dados suficientes para esta quebra.</p> : null}
    </div>
  </section>;
}

function HashRow({ label, value }: { label: string; value?: string }) {
  return <div className="min-w-0 rounded-lg bg-surface-container-lowest p-3"><dt className="text-outline">{label}</dt><dd className="mt-1 truncate font-mono text-on-surface" title={value}>{value ?? "—"}</dd></div>;
}

function formatMw(value: number): string { return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MW`; }
function formatSignedMw(value: number): string { return `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MW`; }
function formatInteger(value: number): string { return value.toLocaleString("pt-BR"); }
function formatPercent(value: number | null): string { return value === null ? "—" : `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`; }
function formatGain(value?: number | null, baseline = "curva física"): string {
  if (value === null || value === undefined) return "ganho não calculável";
  const percent = Math.abs(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return value >= 0 ? `${percent}% menor que ${baseline}` : `${percent}% maior que ${baseline}`;
}
