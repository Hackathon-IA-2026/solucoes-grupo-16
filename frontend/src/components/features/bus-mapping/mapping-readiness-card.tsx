import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';
import { ProgressBar } from '@/components/ui/progress-bar';

export function MappingReadinessCard() {
  return (
    <div className="lg:col-span-4 p-space-lg rounded-xl bg-surface-container shadow-md flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Conformidade Topológica</span>
        <span className="px-space-xs py-0.5 rounded bg-error-container/40 text-on-error-container font-data-mono-sm text-data-mono-sm">3 Pendências</span>
      </div>
      <div className="my-space-sm">
        <div className="flex items-baseline justify-between mb-space-xs">
          <div className="flex items-baseline gap-space-xs">
            <span className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">21</span>
            <span className="font-body-md text-body-md text-on-surface-variant">de 24 Usinas</span>
          </div>
          <span className="font-data-mono-lg text-data-mono-lg text-secondary font-bold">87.5%</span>
        </div>
        {/* Custom Step Progress */}
        <div className="w-full h-2 rounded bg-surface-container-lowest overflow-hidden flex">
          <div className="h-full bg-secondary transition-all duration-500" style={{ width: '87.5%' }}></div>
          <div className="h-full bg-error animate-pulse" style={{ width: '12.5%' }}></div>
        </div>
      </div>
      <div className="flex items-start gap-space-xs p-space-xs rounded bg-surface-container-lowest text-on-surface-variant">
        <MaterialSymbol icon="warning" className="text-error text-[16px] shrink-0 mt-0.5" />
        <p className="font-label-sm text-label-sm leading-tight">
          Restam 3 usinas sem barra associada. O arquivo PWF exige 100% de preenchimento para compilar sem erros de ilhamento.
        </p>
      </div>
    </div>
  );
}
