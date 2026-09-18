import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function PlantFiltersBar() {
  return (
    <div className="bg-surface-container-low p-space-md rounded-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md shadow-sm">
      {/* Left: Search & Dropdown Filters */}
      <div className="flex flex-wrap items-center gap-space-sm flex-1">
        {/* Search Input */}
        <div className="relative min-w-[240px] flex-1 sm:flex-initial">
          <MaterialSymbol icon="search" className="absolute left-space-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]" />
          <input 
            className="w-full bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-sm text-body-sm pl-9 pr-space-md py-space-xs rounded-lg focus:outline-none focus:bg-surface-container-high transition-all" 
            id="search-input" 
            placeholder="Buscar Usina ou ID ONS..." 
            type="text"
          />
        </div>
        {/* State Multi-Select / Filter */}
        <div className="relative">
          <select className="bg-surface-container-lowest text-on-surface font-body-sm text-body-sm px-space-md py-space-xs rounded-lg appearance-none pr-8 focus:outline-none focus:bg-surface-container-high cursor-pointer" id="filter-state">
            <option value="ALL">Todos os Estados (BA, RN, CE, PI)</option>
            <option value="BA">Bahia (BA)</option>
            <option value="RN">Rio Grande do Norte (RN)</option>
            <option value="PI">Piauí (PI)</option>
            <option value="CE">Ceará (CE)</option>
          </select>
          <MaterialSymbol icon="expand_more" className="absolute right-space-xs top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none" />
        </div>
        {/* Curtailment Risk Filter */}
        <div className="relative">
          <select className="bg-surface-container-lowest text-on-surface font-body-sm text-body-sm px-space-md py-space-xs rounded-lg appearance-none pr-8 focus:outline-none focus:bg-surface-container-high cursor-pointer" id="filter-risk">
            <option value="ALL">Todos os Riscos</option>
            <option value="CURT">Com Histórico de Curtailment</option>
            <option value="HIGH_GEN">Alta Geração Prevista (&gt;80% Cap)</option>
            <option value="CRIT">Gargalo Crítico (REL)</option>
          </select>
          <MaterialSymbol icon="expand_more" className="absolute right-space-xs top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none" />
        </div>
      </div>
      
      {/* Right: Sorting & Visual Modes */}
      <div className="flex items-center gap-space-sm justify-between lg:justify-end">
        {/* Sorting Selector */}
        <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-xs rounded-lg">
          <MaterialSymbol icon="sort" className="text-[16px] text-on-surface-variant" />
          <select className="bg-transparent text-on-surface font-body-sm text-body-sm focus:outline-none cursor-pointer pr-4" id="sort-selector">
            <option value="GEN_DESC">Maior Geração Prevista (MW)</option>
            <option value="CAP_DESC">Maior Capacidade (MW)</option>
            <option value="CONF_ASC">Menor Nível de Confiança</option>
            <option value="DISP_DESC">Maior Disponibilidade Histórica</option>
          </select>
        </div>
        {/* View Switcher Tabs */}
        <div className="flex items-center bg-surface-container-lowest p-0.5 rounded-lg">
          <button className="px-space-sm py-1 rounded bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-1">
            <MaterialSymbol icon="table_rows" className="text-[16px]" />
            <span className="hidden sm:inline">Tabela</span>
          </button>
          <button className="px-space-sm py-1 rounded text-on-surface-variant hover:text-on-surface font-label-md text-label-md flex items-center gap-1">
            <MaterialSymbol icon="map" className="text-[16px]" />
            <span className="hidden sm:inline">Mapa</span>
          </button>
        </div>
      </div>
    </div>
  );
}
