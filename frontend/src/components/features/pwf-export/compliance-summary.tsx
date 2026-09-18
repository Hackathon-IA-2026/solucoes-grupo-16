import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function ComplianceSummary() {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md">
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-sm flex-wrap">
          <span className="font-label-sm text-label-sm uppercase tracking-widest text-secondary bg-surface-container-highest px-space-sm py-space-xs rounded">Módulo 26 ONS • CCEE Desk</span>
          <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant flex items-center gap-space-xs">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            ANAREDE Kernel v11.4 Rev.03
          </span>
          <span className="font-data-mono-sm text-data-mono-sm text-outline">•</span>
          <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Deck Base: 2025/05-S1-NE</span>
        </div>
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Exportação de Estudo Elétrico e Matriz de Risco de Curtailment</h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl">
          Processamento estocástico de fluxo de potência ótimo (OPF), correlação meteorológica de vento para geração horária e cálculo de severidade de cortes físicos e regulatórios no Subsistema Nordeste.
        </p>
      </div>
      {/* Live Compliance Status Indicator */}
      <div className="flex items-center gap-space-md bg-surface-container p-space-md rounded-lg self-start lg:self-center shadow-sm">
        <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-secondary">
          <MaterialSymbol icon="verified_user" className="text-[24px]" />
        </div>
        <div className="flex flex-col">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Conformidade Operativa</span>
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-space-xs">
            98.7% Estável
            <span className="w-2 h-2 rounded-full bg-tertiary"></span>
          </span>
          <span className="font-data-mono-sm text-data-mono-sm text-outline">Critério N-1 Ativo</span>
        </div>
      </div>
    </div>
  );
}
