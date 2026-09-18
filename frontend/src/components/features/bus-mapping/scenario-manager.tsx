import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function ScenarioManager() {
  return (
    <div className="lg:col-span-8 p-space-lg rounded-xl bg-surface-container shadow-md flex flex-col justify-between gap-space-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <MaterialSymbol icon="bookmarks" className="text-tertiary text-[18px]" />
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Gerenciador de Topologias Salvas</span>
        </div>
        <span className="font-data-mono-sm text-data-mono-sm text-outline">PWF-SYNC ID: #SIN-8902-REV4</span>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-space-sm w-full">
        <div className="relative flex-1 w-full">
          <MaterialSymbol icon="edit_note" className="absolute left-space-md top-1/2 -translate-y-1/2 text-outline text-[18px]" />
          <input 
            className="w-full bg-surface-container-lowest text-on-surface pl-10 pr-space-md py-space-sm rounded font-body-md text-body-md focus:outline-none focus:bg-surface-container-low transition-colors" 
            placeholder="Nome do cenário..." 
            type="text" 
            defaultValue="Estudo Ventos Fortes Ago/2026 - Ponto Máximo Noturno"
          />
        </div>
        <button className="w-full sm:w-auto px-space-md py-space-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md hover:bg-inverse-primary transition-all shrink-0 flex items-center justify-center gap-space-xs shadow-sm">
          <MaterialSymbol icon="save" className="text-[16px]" />
          <span>Salvar Cenário</span>
        </button>
        <div className="relative w-full sm:w-auto">
          <select className="w-full sm:w-64 appearance-none bg-surface-container-low text-on-surface pl-space-md pr-8 py-space-sm rounded font-body-md text-body-md focus:outline-none cursor-pointer">
            <option value="base_2026">Base Padrão ONS 2026</option>
            <option value="eixo_500">Cenário Crítico Eixo 500kV NE</option>
            <option value="se_ne_rev2">Deck SE/NE Curtailment Máx</option>
            <option value="subsistema_n">Fluxo N-NE Intercâmbio Elevado</option>
          </select>
          <MaterialSymbol icon="expand_more" className="absolute right-space-sm top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[18px]" />
        </div>
      </div>
      <div className="flex items-center gap-space-sm flex-wrap font-label-sm text-label-sm text-on-surface-variant">
        <span className="flex items-center gap-space-xs"><span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Subsistema Nordeste Ativo</span>
        <span>•</span>
        <span>Intercâmbio Exportação NE-SE: +4.800 MW</span>
        <span>•</span>
        <span className="text-secondary">Cálculo Base: Newton-Raphson com Limites Q</span>
      </div>
    </div>
  );
}
