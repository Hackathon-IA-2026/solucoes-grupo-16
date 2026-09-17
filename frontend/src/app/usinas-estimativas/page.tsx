
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';

export default function UsinasEstimativasPage() {
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  return (
    <AppShell>
      
<div className="flex flex-col w-full gap-space-xl">
{/* Top Visual Status & Headline Block */}
<div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
<div className="flex flex-col gap-space-xs">
<div className="flex items-center gap-space-sm">
<span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm uppercase bg-primary/10 text-primary font-semibold">Etapa 2 de 4</span>
<span className="text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">• Projeção Física Preliminar</span>
</div>
<h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Estimativas de Geração por Parque Eólico - Modelo IA</h1>
<p className="font-body-md text-body-md text-on-surface-variant">Disponibilidade aerogeradora combinada com previsão climática ECMWF/ERA5 e parâmetros de telemetria ONS.</p>
</div>
{/* Quick Actions */}
<div className="flex items-center gap-space-sm">
<button className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-all shadow-sm" id="btn-recalcular">
<span className="material-symbols-outlined text-[16px] text-tertiary" id="recalc-icon">autorenew</span>
<span className="font-label-md text-label-md">Recalcular Ensemble</span>
</button>
<button className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-all shadow-sm">
<span className="material-symbols-outlined text-[16px] text-secondary">tune</span>
<span className="font-label-md text-label-md">Hiperparâmetros IA</span>
</button>
</div>
</div>
{/* KPI Grid (Bento style 4-column) */}
<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
{/* KPI 1 */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
<div className="absolute -right-4 -top-4 w-20 h-20 bg-primary/5 rounded-full blur-xl group-hover:bg-primary/10 transition-all"></div>
<div className="flex items-center justify-between">
<span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Usinas Filtradas</span>
<span className="material-symbols-outlined text-primary text-[20px]">wind_power</span>
</div>
<div className="mt-space-md flex items-baseline gap-space-xs">
<span className="font-headline-xl text-headline-xl text-on-surface">24</span>
<span className="font-label-md text-label-md text-on-surface-variant">usinas</span>
</div>
<div className="mt-space-xs flex items-center justify-between text-on-surface-variant">
<span className="font-body-sm text-body-sm">Subsistema NE Ativo</span>
<span className="font-data-mono-sm text-data-mono-sm text-primary">100% elegíveis</span>
</div>
</div>
{/* KPI 2 */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
<div className="absolute -right-4 -top-4 w-20 h-20 bg-secondary/5 rounded-full blur-xl group-hover:bg-secondary/10 transition-all"></div>
<div className="flex items-center justify-between">
<span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Capacidade Instalada</span>
<span className="material-symbols-outlined text-secondary text-[20px]">offline_bolt</span>
</div>
<div className="mt-space-md flex items-baseline gap-space-xs">
<span className="font-headline-xl text-headline-xl text-on-surface font-data-mono-lg">2.840,5</span>
<span className="font-label-md text-label-md text-on-surface-variant">MW</span>
</div>
<div className="mt-space-xs flex items-center justify-between text-on-surface-variant">
<span className="font-body-sm text-body-sm">Potência Nominal Total</span>
<span className="font-data-mono-sm text-data-mono-sm text-secondary">1.142 aerogeradores</span>
</div>
</div>
{/* KPI 3 */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
<div className="absolute -right-4 -top-4 w-20 h-20 bg-tertiary/5 rounded-full blur-xl group-hover:bg-tertiary/10 transition-all"></div>
<div className="flex items-center justify-between">
<span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Geração Estimada Média</span>
<span className="material-symbols-outlined text-tertiary text-[20px]">speed</span>
</div>
<div className="mt-space-md flex items-baseline gap-space-xs">
<span className="font-headline-xl text-headline-xl text-tertiary font-data-mono-lg">2.195,2</span>
<span className="font-label-md text-label-md text-on-surface-variant">MW</span>
</div>
<div className="mt-space-xs flex items-center justify-between text-on-surface-variant">
<span className="font-body-sm text-body-sm">Fator de Capacidade Médio</span>
<span className="px-space-xs py-0.5 rounded bg-tertiary-container/30 text-tertiary font-data-mono-sm text-data-mono-sm font-semibold">77.3%</span>
</div>
</div>
{/* KPI 4 */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
<div className="absolute -right-4 -top-4 w-20 h-20 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all"></div>
<div className="flex items-center justify-between">
<span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Risco Prévio de Curtailment</span>
<span className="material-symbols-outlined text-amber-400 text-[20px]">warning</span>
</div>
<div className="mt-space-md flex items-baseline gap-space-xs">
<span className="font-headline-xl text-headline-xl text-amber-400 font-data-mono-lg">38%</span>
<span className="font-label-md text-label-md text-on-surface-variant">(9 usinas)</span>
</div>
<div className="mt-space-xs flex items-center justify-between text-on-surface-variant">
<span className="font-body-sm text-body-sm">Gargalo Elétrico ONS</span>
<span className="font-data-mono-sm text-data-mono-sm text-amber-300">Nível Crítico</span>
</div>
</div>
</div>
{/* IA Pipeline Status & Simulation Feedback Card */}
<div className="bg-surface-container-low p-space-md rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md shadow-sm">
<div className="flex items-center gap-space-md">
<div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-tertiary text-[20px]">neurology</span>
</div>
<div className="flex flex-col">
<div className="flex items-center gap-space-xs">
<span className="font-label-md text-label-md text-on-surface font-semibold">Ensemble de Predição Ativo</span>
<span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
<span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Random Forest (40%) + LightGBM (60%)</span>
</div>
<span className="font-body-sm text-body-sm text-on-surface-variant">Treinado com dados históricos ONS 2021-2024 e reanálise horária ERA5 ECMWF. Inferência concluída em 1.2s.</span>
</div>
</div>
<div className="flex items-center gap-space-md shrink-0 w-full sm:w-auto justify-end">
<div className="hidden lg:flex flex-col items-end">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Erro Médio Absoluto (MAE)</span>
<span className="font-data-mono-sm text-data-mono-sm text-emerald-400">± 3.8% MW</span>
</div>
<button className="px-space-sm py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-all flex items-center gap-space-xs" id="toggle-sim-mode">
<span className="material-symbols-outlined text-[14px]">view_timeline</span>
<span>Simular Skeleton Loader</span>
</button>
</div>
</div>
{/* Filters & Controls Bar (Shadcn style) */}
<div className="bg-surface-container-low p-space-md rounded-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-md shadow-sm">
{/* Left: Search & Dropdown Filters */}
<div className="flex flex-wrap items-center gap-space-sm flex-1">
{/* Search Input */}
<div className="relative min-w-[240px] flex-1 sm:flex-initial">
<span className="material-symbols-outlined absolute left-space-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
<input className="w-full bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-sm text-body-sm pl-9 pr-space-md py-space-xs rounded-lg focus:outline-none focus:bg-surface-container-high transition-all" id="search-input" placeholder="Buscar Usina ou ID ONS..." type="text"/>
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
<span className="material-symbols-outlined absolute right-space-xs top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none">expand_more</span>
</div>
{/* Curtailment Risk Filter */}
<div className="relative">
<select className="bg-surface-container-lowest text-on-surface font-body-sm text-body-sm px-space-md py-space-xs rounded-lg appearance-none pr-8 focus:outline-none focus:bg-surface-container-high cursor-pointer" id="filter-risk">
<option value="ALL">Todos os Riscos</option>
<option value="CURT">Com Histórico de Curtailment</option>
<option value="HIGH_GEN">Alta Geração Prevista (&gt;80% Cap)</option>
<option value="CRIT">Gargalo Crítico (REL)</option>
</select>
<span className="material-symbols-outlined absolute right-space-xs top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px] pointer-events-none">expand_more</span>
</div>
</div>
{/* Right: Sorting & Visual Modes */}
<div className="flex items-center gap-space-sm justify-between lg:justify-end">
{/* Sorting Selector */}
<div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-xs rounded-lg">
<span className="material-symbols-outlined text-[16px] text-on-surface-variant">sort</span>
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
<span className="material-symbols-outlined text-[16px]">table_rows</span>
<span className="hidden sm:inline">Tabela</span>
</button>
<button className="px-space-sm py-1 rounded text-on-surface-variant hover:text-on-surface font-label-md text-label-md flex items-center gap-1">
<span className="material-symbols-outlined text-[16px]">map</span>
<span className="hidden sm:inline">Mapa</span>
</button>
</div>
</div>
</div>
{/* Loading Skeleton State Container (Toggled via JS) */}
<div className="hidden flex-col gap-space-xs bg-surface-container-low p-space-md rounded-xl animate-pulse shadow-sm" id="skeleton-loader">
<div className="h-8 bg-surface-container-high rounded w-full mb-2"></div>
<div className="h-10 bg-surface-container-highest rounded w-full"></div>
<div className="h-10 bg-surface-container-high rounded w-full"></div>
<div className="h-10 bg-surface-container-highest rounded w-full"></div>
<div className="h-10 bg-surface-container-high rounded w-full"></div>
<div className="h-10 bg-surface-container-highest rounded w-full"></div>
<div className="h-10 bg-surface-container-high rounded w-full"></div>
</div>
{/* Rich Enterprise Data Table (Shadcn UI style) */}
<div className="bg-surface-container-low rounded-xl shadow-sm overflow-hidden flex flex-col" id="table-container">
{/* Table Wrapper with horizontal scrolling */}
<div className="overflow-x-auto w-full">
<table className="w-full text-left border-collapse">
<thead>
<tr className="bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider select-none">
<th className="py-space-md px-space-md w-10 text-center">
<input defaultChecked className="w-4 h-4 rounded bg-surface-container-high text-primary cursor-pointer accent-primary" id="select-all" type="checkbox"/>
</th>
<th className="py-space-md px-space-md font-medium">ID ONS</th>
<th className="py-space-md px-space-md font-medium">Usina / Complexo Eólico</th>
<th className="py-space-md px-space-md font-medium text-center">UF</th>
<th className="py-space-md px-space-md font-medium text-right font-data-mono-sm">Cap. Inst.</th>
<th className="py-space-md px-space-md font-medium text-center">Coordenadas</th>
<th className="py-space-md px-space-md font-medium text-right font-data-mono-sm">Geração Prevista</th>
<th className="py-space-md px-space-md font-medium text-center">Disp. Histórica</th>
<th className="py-space-md px-space-md font-medium text-center">Confiança IA</th>
<th className="py-space-md px-space-md font-medium text-center">Histórico ONS</th>
<th className="py-space-md px-space-md text-center w-12">Ações</th>
</tr>
</thead>
<tbody className="divide-y-0 text-on-surface font-body-sm text-body-sm" id="plant-table-body">
{/* Row 1 */}
<tr className="bg-surface-container-low hover:bg-surface-container-high/60 transition-colors duration-150 group">
<td className="py-space-sm px-space-md text-center">
<input defaultChecked className="row-checkbox w-4 h-4 rounded bg-surface-container-high accent-primary cursor-pointer" type="checkbox"/>
</td>
<td className="py-space-sm px-space-md font-data-mono-sm text-data-mono-sm text-secondary font-medium whitespace-nowrap">
              EOL-BA-CH01
            </td>
<td className="py-space-sm px-space-md font-medium">
<div className="flex flex-col">
<span className="text-on-surface font-medium hover:text-primary transition-colors cursor-pointer">Complexo Chapada Diamante I</span>
<span className="text-on-surface-variant font-label-sm text-label-sm">Subestação SE Gentio do Ouro 230kV</span>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-semibold bg-surface-container-highest text-on-surface">BA</span>
</td>
<td className="py-space-sm px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface whitespace-nowrap">
              180,0 <span className="text-on-surface-variant font-label-sm text-label-sm">MW</span>
</td>
<td className="py-space-sm px-space-md text-center">
<a className="font-data-mono-sm text-data-mono-sm text-on-surface-variant hover:text-tertiary inline-flex items-center gap-0.5 transition-colors" href="#">
<span>-11.552°, -41.285°</span>
<span className="material-symbols-outlined text-[14px]">open_in_new</span>
</a>
</td>
<td className="py-space-sm px-space-md text-right whitespace-nowrap">
<div className="flex flex-col items-end gap-1">
<div className="flex items-baseline gap-1">
<span className="font-data-mono-lg text-data-mono-lg font-bold text-tertiary">158,4</span>
<span className="font-label-sm text-label-sm text-on-surface-variant">MW</span>
</div>
{/* Mini Progress Dispatch Bar */}
<div className="w-24 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
<div className="bg-tertiary h-full rounded-full" style={{ "width": "88%" }}></div>
</div>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<div className="inline-flex items-center gap-space-xs">
<div className="w-12 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
<div className="bg-emerald-400 h-full rounded-full" style={{ "width": "98%" }}></div>
</div>
<span className="font-data-mono-sm text-data-mono-sm text-emerald-400 font-medium">98.4%</span>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm font-semibold bg-emerald-500/10 text-emerald-400">
                Alto (96%)
              </span>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-data-mono-sm uppercase tracking-wide bg-amber-500/15 text-amber-300">
                Freq. REL
              </span>
</td>
<td className="py-space-sm px-space-md text-center">
<button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-all">
<span className="material-symbols-outlined text-[18px]">more_vert</span>
</button>
</td>
</tr>
{/* Row 2 */}
<tr className="bg-surface-container-high/20 hover:bg-surface-container-high/60 transition-colors duration-150 group">
<td className="py-space-sm px-space-md text-center">
<input defaultChecked className="row-checkbox w-4 h-4 rounded bg-surface-container-high accent-primary cursor-pointer" type="checkbox"/>
</td>
<td className="py-space-sm px-space-md font-data-mono-sm text-data-mono-sm text-secondary font-medium whitespace-nowrap">
              EOL-BA-MC02
            </td>
<td className="py-space-sm px-space-md font-medium">
<div className="flex flex-col">
<span className="text-on-surface font-medium hover:text-primary transition-colors cursor-pointer">Eólica Morro do Chapéu Sul</span>
<span className="text-on-surface-variant font-label-sm text-label-sm">Subestação SE Ourolândia II 500kV</span>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-semibold bg-surface-container-highest text-on-surface">BA</span>
</td>
<td className="py-space-sm px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface whitespace-nowrap">
              220,0 <span className="text-on-surface-variant font-label-sm text-label-sm">MW</span>
</td>
<td className="py-space-sm px-space-md text-center">
<a className="font-data-mono-sm text-data-mono-sm text-on-surface-variant hover:text-tertiary inline-flex items-center gap-0.5 transition-colors" href="#">
<span>-11.230°, -41.110°</span>
<span className="material-symbols-outlined text-[14px]">open_in_new</span>
</a>
</td>
<td className="py-space-sm px-space-md text-right whitespace-nowrap">
<div className="flex flex-col items-end gap-1">
<div className="flex items-baseline gap-1">
<span className="font-data-mono-lg text-data-mono-lg font-bold text-tertiary">189,2</span>
<span className="font-label-sm text-label-sm text-on-surface-variant">MW</span>
</div>
<div className="w-24 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
<div className="bg-tertiary h-full rounded-full" style={{ "width": "86%" }}></div>
</div>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<div className="inline-flex items-center gap-space-xs">
<div className="w-12 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
<div className="bg-emerald-400 h-full rounded-full" style={{ "width": "96%" }}></div>
</div>
<span className="font-data-mono-sm text-data-mono-sm text-emerald-400 font-medium">96.1%</span>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm font-semibold bg-emerald-500/10 text-emerald-400">
                Alto (94%)
              </span>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-data-mono-sm uppercase tracking-wide bg-indigo-500/15 text-indigo-300">
                Ocasional CNF
              </span>
</td>
<td className="py-space-sm px-space-md text-center">
<button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-all">
<span className="material-symbols-outlined text-[18px]">more_vert</span>
</button>
</td>
</tr>
{/* Row 3 */}
<tr className="bg-surface-container-low hover:bg-surface-container-high/60 transition-colors duration-150 group">
<td className="py-space-sm px-space-md text-center">
<input defaultChecked className="row-checkbox w-4 h-4 rounded bg-surface-container-high accent-primary cursor-pointer" type="checkbox"/>
</td>
<td className="py-space-sm px-space-md font-data-mono-sm text-data-mono-sm text-secondary font-medium whitespace-nowrap">
              EOL-PI-LG02
            </td>
<td className="py-space-sm px-space-md font-medium">
<div className="flex flex-col">
<span className="text-on-surface font-medium hover:text-primary transition-colors cursor-pointer">Complexo Ventos de Santa Joana</span>
<span className="text-on-surface-variant font-label-sm text-label-sm">Subestação SE Curral Novo 500kV</span>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-semibold bg-surface-container-highest text-on-surface">PI</span>
</td>
<td className="py-space-sm px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface whitespace-nowrap">
              300,0 <span className="text-on-surface-variant font-label-sm text-label-sm">MW</span>
</td>
<td className="py-space-sm px-space-md text-center">
<a className="font-data-mono-sm text-data-mono-sm text-on-surface-variant hover:text-tertiary inline-flex items-center gap-0.5 transition-colors" href="#">
<span>-08.810°, -40.890°</span>
<span className="material-symbols-outlined text-[14px]">open_in_new</span>
</a>
</td>
<td className="py-space-sm px-space-md text-right whitespace-nowrap">
<div className="flex flex-col items-end gap-1">
<div className="flex items-baseline gap-1">
<span className="font-data-mono-lg text-data-mono-lg font-bold text-tertiary">246,0</span>
<span className="font-label-sm text-label-sm text-on-surface-variant">MW</span>
</div>
<div className="w-24 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
<div className="bg-tertiary h-full rounded-full" style={{ "width": "82%" }}></div>
</div>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<div className="inline-flex items-center gap-space-xs">
<div className="w-12 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
<div className="bg-emerald-400 h-full rounded-full" style={{ "width": "99%" }}></div>
</div>
<span className="font-data-mono-sm text-data-mono-sm text-emerald-400 font-medium">99.1%</span>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm font-semibold bg-sky-500/10 text-sky-400">
                Excelente (98%)
              </span>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-data-mono-sm uppercase tracking-wide bg-emerald-500/15 text-emerald-300">
                Baixo ENE
              </span>
</td>
<td className="py-space-sm px-space-md text-center">
<button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-all">
<span className="material-symbols-outlined text-[18px]">more_vert</span>
</button>
</td>
</tr>
{/* Row 4 */}
<tr className="bg-surface-container-high/20 hover:bg-surface-container-high/60 transition-colors duration-150 group">
<td className="py-space-sm px-space-md text-center">
<input defaultChecked className="row-checkbox w-4 h-4 rounded bg-surface-container-high accent-primary cursor-pointer" type="checkbox"/>
</td>
<td className="py-space-sm px-space-md font-data-mono-sm text-data-mono-sm text-secondary font-medium whitespace-nowrap">
              EOL-PI-DP03
            </td>
<td className="py-space-sm px-space-md font-medium">
<div className="flex flex-col">
<span className="text-on-surface font-medium hover:text-primary transition-colors cursor-pointer">Delta do Parnaíba III</span>
<span className="text-on-surface-variant font-label-sm text-label-sm">Subestação SE Ilha Grande 230kV</span>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-semibold bg-surface-container-highest text-on-surface">PI</span>
</td>
<td className="py-space-sm px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface whitespace-nowrap">
              90,0 <span className="text-on-surface-variant font-label-sm text-label-sm">MW</span>
</td>
<td className="py-space-sm px-space-md text-center">
<a className="font-data-mono-sm text-data-mono-sm text-on-surface-variant hover:text-tertiary inline-flex items-center gap-0.5 transition-colors" href="#">
<span>-02.910°, -41.760°</span>
<span className="material-symbols-outlined text-[14px]">open_in_new</span>
</a>
</td>
<td className="py-space-sm px-space-md text-right whitespace-nowrap">
<div className="flex flex-col items-end gap-1">
<div className="flex items-baseline gap-1">
<span className="font-data-mono-lg text-data-mono-lg font-bold text-tertiary">71,5</span>
<span className="font-label-sm text-label-sm text-on-surface-variant">MW</span>
</div>
<div className="w-24 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
<div className="bg-tertiary h-full rounded-full" style={{ "width": "79%" }}></div>
</div>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<div className="inline-flex items-center gap-space-xs">
<div className="w-12 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
<div className="bg-amber-400 h-full rounded-full" style={{ "width": "91%" }}></div>
</div>
<span className="font-data-mono-sm text-data-mono-sm text-amber-400 font-medium">91.5%</span>
</div>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm font-semibold bg-amber-500/10 text-amber-300">
                Médio (82%)
              </span>
</td>
<td className="py-space-sm px-space-md text-center">
<span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-data-mono-sm uppercase tracking-wide bg-surface-container-highest text-on-surface-variant">
                Sem histórico
              </span>
</td>
<td className="py-space-sm px-space-md text-center">
<button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-all">
<span className="material-symbols-outlined text-[18px]">more_vert</span>
</button>
</td>
</tr>
</tbody>
</table>
</div>
{/* Table Pagination & Selection Summary Bar */}
<div className="bg-surface-container-lowest px-space-lg py-space-md flex flex-col md:flex-row items-center justify-between gap-space-md">
{/* Left: Counter & Selection Info */}
<div className="flex items-center gap-space-md">
<span className="font-body-sm text-body-sm text-on-surface-variant">
          Mostrando <span className="font-semibold text-on-surface">1-4</span> de <span className="font-semibold text-on-surface">24</span> usinas
        </span>
<span className="hidden sm:inline text-outline">•</span>
<span className="font-data-mono-sm text-data-mono-sm text-tertiary" id="selection-counter">
          4 de 4 selecionadas na página (24 total no deck)
        </span>
</div>
{/* Right: Pagination Buttons */}
<div className="flex items-center gap-space-sm">
<button className="px-space-sm py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant disabled={true}:opacity-40 disabled={true}:cursor-not-allowed font-label-md text-label-md flex items-center gap-1" disabled={true}>
<span className="material-symbols-outlined text-[16px]">chevron_left</span>
<span>Anterior</span>
</button>
<div className="flex items-center gap-1">
<button className="w-7 h-7 rounded bg-primary text-on-primary font-data-mono-sm text-data-mono-sm font-semibold flex items-center justify-center">1</button>
<button className="w-7 h-7 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">2</button>
<button className="w-7 h-7 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">3</button>
</div>
<button className="px-space-sm py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md flex items-center gap-1">
<span>Próxima</span>
<span className="material-symbols-outlined text-[16px]">chevron_right</span>
</button>
</div>
</div>
</div>
{/* Bottom Global Transition / Confirmation Footer Bar */}
<div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col sm:flex-row items-center justify-between gap-space-md shadow-sm">
<div className="flex items-center gap-space-md">
<div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
<span className="material-symbols-outlined text-[24px]">schema</span>
</div>
<div className="flex flex-col">
<span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Próximo Passo: Mapeamento Elétrico de Barras (ANAREDE DBAR)</span>
<span className="font-body-sm text-body-sm text-on-surface-variant">Os valores de geração estimada (MW) calculados serão alocados nas barras elétricas do SIN para simulação de fluxo de carga.</span>
</div>
</div>
<a className="w-full sm:w-auto px-space-xl py-space-sm rounded-lg bg-primary-container hover:bg-inverse-primary text-on-primary-container font-headline-sm text-headline-sm font-medium flex items-center justify-center gap-space-sm transition-all shadow-md active:scale-[0.99] whitespace-nowrap" data-path="mapeamento-barras" href="/mapeamento-barras" id="btn-proceed">
<span>Prosseguir para Mapeamento Elétrico de Barras (24 selecionadas)</span>
<span className="material-symbols-outlined text-[20px]">arrow_forward</span>
</a>
</div>
</div>

    </AppShell>
  );
}
