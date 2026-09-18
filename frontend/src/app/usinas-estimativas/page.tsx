'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { MaterialSymbol } from '@/components/ui/material-symbol';
import { GenerationKpiGrid } from '@/components/features/generation/generation-kpi-grid';
import { ModelPipelineStatus } from '@/components/features/generation/model-pipeline-status';
import { PlantFiltersBar } from '@/components/features/generation/plant-filters-bar';
import { GenerationTable } from '@/components/features/generation/generation-table';

export default function UsinasEstimativasPage() {
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  return (
    <AppShell>
      <div className="flex flex-col w-full gap-space-xl">
        {/* Top Visual Status & Headline Block */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-sm">
              <span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm uppercase bg-primary/10 text-primary font-semibold">Etapa 2 de 4</span>
              <span className="text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">• Projeção Física Preliminar</span>
            </div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Estimativas de Geração por Parque Eólico - Modelo IA</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Disponibilidade aerogeradora combinada com previsão climática ECMWF/ERA5 e parâmetros de telemetria ONS.</p>
          </div>
          {/* Quick Actions */}
          <div className="flex items-center gap-space-sm">
            <button className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-all shadow-sm" id="btn-recalcular">
              <MaterialSymbol icon="autorenew" className="text-[16px] text-tertiary" id="recalc-icon" />
              <span className="font-label-md text-label-md">Recalcular Ensemble</span>
            </button>
            <button className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-all shadow-sm">
              <MaterialSymbol icon="tune" className="text-[16px] text-secondary" />
              <span className="font-label-md text-label-md">Hiperparâmetros IA</span>
            </button>
          </div>
        </div>

        {/* KPI Grid */}
        <GenerationKpiGrid />

        {/* IA Pipeline Status & Simulation Feedback Card */}
        <ModelPipelineStatus />

        {/* Filters & Controls Bar */}
        <PlantFiltersBar />

        {/* Loading Skeleton State Container (Toggled via JS) */}
        <div className={`${isSimulating ? 'flex' : 'hidden'} flex-col gap-space-xs bg-surface-container-low p-space-md rounded-xl animate-pulse shadow-sm`} id="skeleton-loader">
          <div className="h-8 bg-surface-container-high rounded w-full mb-2"></div>
          <div className="h-10 bg-surface-container-highest rounded w-full"></div>
          <div className="h-10 bg-surface-container-high rounded w-full"></div>
          <div className="h-10 bg-surface-container-highest rounded w-full"></div>
          <div className="h-10 bg-surface-container-high rounded w-full"></div>
          <div className="h-10 bg-surface-container-highest rounded w-full"></div>
          <div className="h-10 bg-surface-container-high rounded w-full"></div>
        </div>

        {/* Rich Enterprise Data Table */}
        {!isSimulating && (
          <GenerationTable />
        )}

        {/* Bottom Global Transition / Confirmation Footer Bar */}
        <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col sm:flex-row items-center justify-between gap-space-md shadow-sm">
          <div className="flex items-center gap-space-md">
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
              <MaterialSymbol icon="schema" className="text-[24px]" />
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Próximo Passo: Mapeamento Elétrico de Barras (ANAREDE DBAR)</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Os valores de geração estimada (MW) calculados serão alocados nas barras elétricas do SIN para simulação de fluxo de carga.</span>
            </div>
          </div>
          <Link className="w-full sm:w-auto px-space-xl py-space-sm rounded-lg bg-primary-container hover:bg-inverse-primary text-on-primary-container font-headline-sm text-headline-sm font-medium flex items-center justify-center gap-space-sm transition-all shadow-md active:scale-[0.99] whitespace-nowrap" href="/mapeamento-barras" id="btn-proceed">
            <span>Prosseguir para Mapeamento Elétrico de Barras (24 selecionadas)</span>
            <MaterialSymbol icon="arrow_forward" className="text-[20px]" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
