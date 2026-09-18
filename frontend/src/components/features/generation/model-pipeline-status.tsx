import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function ModelPipelineStatus() {
  return (
    <div className="bg-surface-container-low p-space-md rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md shadow-sm">
      <div className="flex items-center gap-space-md">
        <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
          <MaterialSymbol icon="neurology" className="text-tertiary text-[20px]" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs">
            <span className="font-label-md text-label-md text-on-surface font-semibold">Ensemble de Predição Ativo</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Random Forest (40%) + LightGBM (60%)</span>
          </div>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Treinado com dados históricos ONS 2021-2024 e reanálise horária ERA5 ECMWF. Inferência concluída em 1.2s.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-space-md shrink-0 w-full sm:w-auto justify-end">
        <div className="hidden lg:flex flex-col items-end">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Erro Médio Absoluto (MAE)</span>
          <span className="font-data-mono-sm text-data-mono-sm text-emerald-400">± 3.8% MW</span>
        </div>
        <button 
          className="px-space-sm py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-all flex items-center gap-space-xs" 
          id="toggle-sim-mode"
        >
          <MaterialSymbol icon="view_timeline" className="text-[14px]" />
          <span>Simular Skeleton Loader</span>
        </button>
      </div>
    </div>
  );
}
