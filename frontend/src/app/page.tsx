"use client";
import React from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/ui/page-header';
import { ActionFooter } from '@/components/ui/action-footer';
import { ClimateSourceTabs } from '@/components/features/climate/climate-source-tabs';

export default function ClimaGrid() {
  return (
    <AppShell>
      <div className="flex flex-col w-full gap-space-xl h-full">
        <PageHeader 
          stepName="Passo 01 • Ingestão de Dados"
          contextTag="REANÁLISE_ERA5_SIN_v3"
          title="Definição de Cenário de Vento e Dados Climáticos"
          description="Configure a matriz micrometeorológica de entrada para modelagem hidrodinâmica do escoamento de ar e determinação de geração horária por parque eólico sincronizado ao SIN."
          telemetryMetrics={[
            { label: "Sincronismo ONS", value: "DECK_202608_V1", color: "secondary" },
            { label: "Confiabilidade", value: "99.82% (P90)", color: "tertiary" }
          ]}
        />
        
        <ClimateSourceTabs />

        <div className="mt-auto pt-space-md">
          <ActionFooter 
            secondaryActionLabel="Restaurar Padrões ONS"
            secondaryActionIcon="restart_alt"
            primaryActionLabel="Processar Estimativas de Geração"
            primaryActionHref="/usinas-estimativas"
          />
        </div>
      </div>
    </AppShell>
  );
}
