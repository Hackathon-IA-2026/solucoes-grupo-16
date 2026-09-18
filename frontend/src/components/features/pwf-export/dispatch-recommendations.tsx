import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function DispatchRecommendations() {
  return (
    <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col gap-space-md shadow-md">
      <div className="flex items-center justify-between">
        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Diretrizes do Operador (COSR-NE)</span>
        <MaterialSymbol icon="hub" className="text-tertiary text-[20px]" />
      </div>
      <ul className="flex flex-col gap-space-sm font-body-sm text-body-sm text-on-surface-variant">
        <li className="flex items-start gap-space-sm bg-surface-container p-space-sm rounded">
          <MaterialSymbol icon="priority_high" className="text-[16px] text-secondary mt-0.5" />
          <span>Priorizar alívio em usinas tipo III conectadas em subestações de 230kV com fator de potência &lt; 0.98.</span>
        </li>
        <li className="flex items-start gap-space-sm bg-surface-container p-space-sm rounded">
          <MaterialSymbol icon="info" className="text-[16px] text-tertiary mt-0.5" />
          <span>Arquivo PWF gerado utilizará limites estáticos de transmissão definidos no Módulo 26 sub-rotina 4.</span>
        </li>
      </ul>
    </div>
  );
}
