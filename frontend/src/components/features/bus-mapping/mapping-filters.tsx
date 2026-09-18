import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function MappingFilters() {
  return (
    <div className="p-space-md bg-surface-container-high flex flex-col sm:flex-row items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-sm w-full sm:w-auto">
        <div className="relative w-full sm:w-80">
          <MaterialSymbol icon="search" className="absolute left-space-md top-1/2 -translate-y-1/2 text-outline text-[16px]" />
          <input className="w-full bg-surface-container-lowest text-on-surface pl-9 pr-space-md py-1.5 rounded font-body-sm text-body-sm focus:outline-none" placeholder="Filtrar por usina, ID ONS ou número da barra..." type="text"/>
        </div>
        <div className="hidden sm:flex items-center gap-1 bg-surface-container-lowest p-1 rounded">
          <button className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm">Todas (24)</button>
          <button className="px-2 py-0.5 rounded text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm">Pendentes (3)</button>
          <button className="px-2 py-0.5 rounded text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm">Alertas (1)</button>
        </div>
      </div>
      <div className="flex items-center gap-space-sm self-end sm:self-auto">
        <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Sincronizado c/ ANAREDE v05.24</span>
        <button className="p-1.5 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
          <MaterialSymbol icon="filter_list" className="text-[18px]" />
        </button>
        <button className="p-1.5 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
          <MaterialSymbol icon="refresh" className="text-[18px]" />
        </button>
      </div>
    </div>
  );
}
