import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

interface MappingPageRibbonProps {
  onOpenPreview: () => void;
  onAutoMatch: () => void;
  isAutoMatching: boolean;
  isMatchComplete: boolean;
}

export function MappingPageRibbon({ onOpenPreview, onAutoMatch, isAutoMatching, isMatchComplete }: MappingPageRibbonProps) {
  return (
    <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-md p-space-lg mb-space-lg rounded-xl bg-surface-container-high shadow-md">
      <div className="flex items-center gap-space-md min-w-0">
        <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
          <MaterialSymbol icon="account_tree" className="text-secondary text-[22px]" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-space-sm flex-wrap">
            <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">Mapeamento Elétrico: Associação Usina → Barra do Sistema Interligado (SIN)</h1>
            <span className="px-space-xs py-0.5 rounded bg-primary-container/20 text-primary font-data-mono-sm text-data-mono-sm">DECK 2026/08</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant truncate">Definição topológica estrita para composição dos blocos DBAR, DGER e DINC compatíveis com o solver ANAREDE v05.24.</p>
        </div>
      </div>
      {/* Quick Stats Capsule */}
      <div className="flex items-center gap-space-md shrink-0 self-stretch xl:self-auto justify-between">
        <button 
          className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container-highest hover:bg-surface-variant text-on-surface transition-colors"
          onClick={onOpenPreview}
        >
          <MaterialSymbol icon="terminal" className="text-[18px] text-tertiary" />
          <span className="font-label-md text-label-md">Cartões PWF (DBAR/DGER)</span>
          <span className="w-2 h-2 rounded-full bg-secondary animate-ping"></span>
        </button>
        <button 
          className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-secondary-container hover:bg-secondary text-on-secondary font-medium transition-all shadow-sm"
          onClick={onAutoMatch}
        >
          {isAutoMatching ? (
            <>
              <MaterialSymbol icon="sync" className="text-[18px] animate-spin" />
              <span className="font-label-md text-label-md">Associando 3 nós via KNN...</span>
            </>
          ) : isMatchComplete ? (
            <>
              <MaterialSymbol icon="done_all" className="text-[18px]" />
              <span className="font-label-md text-label-md">100% Barras Resolvidas!</span>
            </>
          ) : (
            <>
              <MaterialSymbol icon="auto_fix_high" className="text-[18px]" />
              <span className="font-label-md text-label-md">Auto-Preencher por Proximidade (IA)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
