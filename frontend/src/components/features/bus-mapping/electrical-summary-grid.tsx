import React from 'react';
import Link from 'next/link';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function ElectricalSummaryGrid() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-lg">
      {/* 500kV Subsystem Card */}
      <div className="lg:col-span-4 p-space-lg rounded-xl bg-surface-container-high shadow-md flex items-center justify-between relative overflow-hidden">
        <div className="flex flex-col z-10">
          <div className="flex items-center gap-space-xs mb-space-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Injeção Rede Básica (500 kV)</span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-semibold">1.450,0</span>
            <span className="font-data-mono-md text-data-mono-md text-secondary">MW</span>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant mt-space-xs">11 Usinas associadas a nós de transmissão pesada</span>
        </div>
        {/* Decorative Sparkline SVG */}
        <svg className="w-24 h-12 text-secondary/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 100 40">
          <path d="M0 35 L20 28 L40 32 L60 12 L80 15 L100 5" />
        </svg>
      </div>
      {/* 230kV Subsystem Card */}
      <div className="lg:col-span-4 p-space-lg rounded-xl bg-surface-container-high shadow-md flex items-center justify-between relative overflow-hidden">
        <div className="flex flex-col z-10">
          <div className="flex items-center gap-space-xs mb-space-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-tertiary"></span>
            <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Injeção Regional (230 kV)</span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-semibold">745,2</span>
            <span className="font-data-mono-md text-data-mono-md text-tertiary">MW</span>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant mt-space-xs">10 Usinas com despacho conectado em subtransmissão</span>
        </div>
        {/* Decorative Sparkline SVG */}
        <svg className="w-24 h-12 text-tertiary/30 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 100 40">
          <path d="M0 25 L20 20 L40 24 L60 18 L80 8 L100 12" />
        </svg>
      </div>
      {/* Total Dispatch & Action Card */}
      <div className="lg:col-span-4 p-space-lg rounded-xl bg-surface-container-highest shadow-md flex flex-col justify-between">
        <div className="flex items-center justify-between mb-space-xs">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Total Injetado no Ponto</span>
          <span className="font-data-mono-md text-data-mono-md text-primary font-bold">2.195,2 MW</span>
        </div>
        <div className="flex items-center justify-between gap-space-sm pt-space-xs">
          <button className="px-space-md py-space-sm rounded bg-surface-container hover:bg-surface-variant text-on-surface font-label-md text-label-md transition-colors flex items-center gap-space-xs">
            <MaterialSymbol icon="replay" className="text-[18px]" />
            <span>Limpar</span>
          </button>
          <Link href="/exportacao-pwf" className="flex-1 px-space-md py-space-sm rounded bg-primary-container hover:bg-inverse-primary text-on-primary-container font-headline-sm text-headline-sm font-semibold transition-all shadow-md flex items-center justify-center gap-space-sm">
            <span>Avançar para Exportação e Risco</span>
            <MaterialSymbol icon="arrow_forward" className="text-[20px]" />
          </Link>
        </div>
      </div>
    </div>
  );
}
