"use client";
import React, { useState } from 'react';
import Image from 'next/image';

export default function ClimaGrid() {
  const [tab, setTab] = useState('historical');
  
  return (
    <>
      <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-low z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]"><div className="flex flex-col"><div className="h-16 px-space-lg flex items-center gap-space-sm bg-surface-container-lowest"><Image src="/logo.svg" alt="ClimaGrid Logo" width={32} height={32} /><div className="flex flex-col"><span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-semibold">ClimaGrid</span><span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">B2B Power Analytics</span></div></div><div className="px-space-md py-space-sm"><div className="px-space-sm py-space-xs font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Workspace</div></div><nav className="flex flex-col gap-space-xs px-space-md" data-active-classes="bg-primary-container text-on-primary-container font-medium rounded-lg"><a aria-current="page" className="flex items-center gap-space-md px-space-md py-space-sm transition-all bg-primary-container text-on-primary-container font-medium rounded-lg" data-path="dados-climaticos" href="#"><span className="material-symbols-outlined text-[18px]">air</span><span className="font-body-md text-body-md">Clima & Vento</span></a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="usinas-estimativas" href="#"><span className="material-symbols-outlined text-[18px]">wind_power</span><span className="font-body-md text-body-md">Parque & Usinas</span></a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="mapeamento-barras" href="#"><span className="material-symbols-outlined text-[18px]">hub</span><span className="font-body-md text-body-md">Mapeamento Barras</span></a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="exportacao-pwf-curtailment" href="#"><span className="material-symbols-outlined text-[18px]">file_save</span><span className="font-body-md text-body-md">Exportação PWF</span></a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="telemetria-sin" href="#"><span className="material-symbols-outlined text-[18px]">monitoring</span><span className="font-body-md text-body-md">Telemetria SIN</span></a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="historico-curtailment" href="#"><span className="material-symbols-outlined text-[18px]">history</span><span className="font-body-md text-body-md">Histórico & ONS</span></a></nav></div><div className="p-space-md bg-surface-container-lowest m-space-md rounded-lg flex flex-col gap-space-xs"><div className="flex items-center justify-between"><span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Kernel ANAREDE</span><span className="w-2 h-2 rounded-full bg-secondary"></span></div><span className="font-data-mono-sm text-data-mono-sm text-secondary">v05.24 COMPATÍVEL</span><span className="font-label-sm text-label-sm text-outline">Deck ONS 2024/04 - Rev 2</span></div></aside><div className="pl-64 flex flex-col min-h-screen"><header className="fixed top-0 left-64 right-0 h-28 bg-surface/90 backdrop-blur-xl z-40 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]"><div className="h-16 px-space-xl flex items-center justify-between"><div className="flex items-center gap-space-lg"><div className="flex items-center gap-space-sm bg-surface-container-high px-space-md py-space-xs rounded-lg"><span className="material-symbols-outlined text-secondary text-[18px]">share_location</span><span className="font-body-sm text-body-sm text-on-surface font-medium">SIN - Subsistema Nordeste ativo</span><span className="material-symbols-outlined text-on-surface-variant text-[16px]">expand_more</span></div><div className="hidden xl:flex items-center gap-space-xs bg-surface-container-low px-space-md py-space-xs rounded-lg"><span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span><span className="font-data-mono-sm text-data-mono-sm text-on-surface">IA Modelo v4.2 • ONS Base Conectada</span></div><div className="hidden md:flex items-center gap-space-xs text-on-surface-variant"><span className="material-symbols-outlined text-[16px] text-tertiary">sync</span><span className="font-data-mono-sm text-data-mono-sm">Sincronizado há 2m</span></div></div><div className="flex items-center gap-space-lg"><div className="hidden lg:flex flex-col items-end text-right"><span className="font-body-sm text-body-sm text-on-surface font-medium">Eng. Carlos Meireles</span><span className="font-label-sm text-label-sm text-on-surface-variant">Planejamento Energético</span></div><div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"><span className="material-symbols-outlined text-on-primary text-[18px]">person</span></div></div></div><div className="h-12 px-space-xl bg-surface-container-low flex items-center"><nav className="flex items-center w-full justify-between gap-space-sm" data-active-classes="bg-primary-container text-on-primary-container font-medium"><a aria-current="page" className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg transition-all bg-primary-container text-on-primary-container font-medium" data-path="dados-climaticos" href="#"><span className="w-5 h-5 rounded-full bg-primary text-on-primary font-data-mono-sm text-data-mono-sm flex items-center justify-center font-bold">1</span><span className="font-body-sm text-body-sm">Entrada Climática</span><span className="material-symbols-outlined text-[16px] text-tertiary">check_circle</span></a><div className="flex-1 h-[1px] bg-surface-variant mx-space-xs"></div><a className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="usinas-estimativas" href="#"><span className="w-5 h-5 rounded-full bg-surface-variant text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">2</span><span className="font-body-sm text-body-sm">Usinas & MW</span></a><div className="flex-1 h-[1px] bg-surface-variant mx-space-xs"></div><a className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="mapeamento-barras" href="#"><span className="w-5 h-5 rounded-full bg-surface-variant text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">3</span><span className="font-body-sm text-body-sm">Mapeamento Barras</span></a><div className="flex-1 h-[1px] bg-surface-variant mx-space-xs"></div><a className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="exportacao-pwf-curtailment" href="#"><span className="w-5 h-5 rounded-full bg-surface-variant text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">4</span><span className="font-body-sm text-body-sm">Exportação PWF & Risco</span></a></nav></div></header><main className="flex-1 pt-28 px-space-xl pb-space-xl w-full bg-surface"><div className="flex flex-col w-full gap-space-xl">
{/* 1. Header & Stage Breadcrumb Context */}
<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md">
<div className="flex flex-col gap-space-xs">
<div className="flex items-center gap-space-sm">
<span className="px-space-sm py-space-xs rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm uppercase tracking-wider font-semibold">Passo 01 • Ingestão de Dados</span>
<span className="font-label-sm text-label-sm text-outline">•</span>
<span className="font-data-mono-sm text-data-mono-sm text-tertiary">REANÁLISE_ERA5_SIN_v3</span>
</div>
<h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">Definição de Cenário de Vento e Dados Climáticos</h1>
<p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
        Configure a matriz micrometeorológica de entrada para modelagem hidrodinâmica do escoamento de ar e determinação de geração horária por parque eólico sincronizado ao SIN.
      </p>
</div>
{/* Quick Telemetry Capsule */}
<div className="flex items-center gap-space-md self-start lg:self-center bg-surface-container-high px-space-lg py-space-sm rounded-lg shadow-sm">
<div className="flex flex-col items-start">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Sincronismo ONS</span>
<span className="font-data-mono-md text-data-mono-md text-secondary font-medium">DECK_202608_V1</span>
</div>
<div className="w-px h-8 bg-surface-variant"></div>
<div className="flex flex-col items-start">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Confiabilidade</span>
<span className="font-data-mono-md text-data-mono-md text-tertiary font-medium">99.82% (P90)</span>
</div>
</div>
</div>
{/* 2. Shadcn Tabs Navigation */}
<div className="flex flex-col gap-space-lg">
<div className="flex p-1 bg-surface-container-lowest rounded-lg max-w-xl shadow-inner self-start">
<button className="flex items-center gap-space-sm px-space-lg py-space-sm rounded-md font-body-sm text-body-sm font-medium transition-all bg-surface-container text-on-surface shadow-sm" id="tab-historical-btn" onClick={() => setTab('historical')}>
<span className="material-symbols-outlined text-[18px] text-tertiary">history_edu</span>
        Usar Dados Históricos ONS/ERA5
      </button>
<button className="flex items-center gap-space-sm px-space-lg py-space-sm rounded-md font-body-sm text-body-sm font-medium transition-all text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50" id="tab-upload-btn" onClick={() => setTab('upload')}>
<span className="material-symbols-outlined text-[18px]">cloud_upload</span>
        Carregar Cenário Próprio (Upload CSV/XLSX)
      </button>
</div>
{/* 3. Tab Content A: Historical Data ONS/ERA5 */}
<div className="flex flex-col gap-space-xl" id="tab-historical-content">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
{/* Configuration Controls Column (7 cols) */}
<div className="lg:col-span-7 flex flex-col gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md">
<div className="flex items-center justify-between">
<span className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-space-sm">
<span className="material-symbols-outlined text-secondary text-[20px]">tune</span>
              Parâmetros de Malha e Tempo
            </span>
<span className="font-data-mono-sm text-data-mono-sm px-space-sm py-space-xs rounded bg-surface-container text-secondary font-medium">REDE BÁSICA 500/230kV</span>
</div>
{/* Subsistema Elétrico Dropdown */}
<div className="flex flex-col gap-space-xs">
<label className="font-label-md text-label-md text-on-surface-variant font-medium flex items-center justify-between">
<span>Subsistema Elétrico Nacional</span>
<span className="font-data-mono-sm text-data-mono-sm text-secondary">87% da capacidade eólica instalada no SIN</span>
</label>
<div className="relative">
<select className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg px-space-lg py-space-md appearance-none shadow-inner focus:outline-none focus:bg-surface-container-high transition-colors">
<option  value="NE">Subsistema Nordeste (NE) — Cobertura Total Eólica</option>
<option value="N">Subsistema Norte (N) — Integração Tucuruí / Belo Monte</option>
<option value="SE_CO">Subsistema Sudeste / Centro-Oeste (SE/CO) — Carga Pesada</option>
<option value="S">Subsistema Sul (S) — Complexos Eólicos Osório / Cerro Chato</option>
</select>
<span className="material-symbols-outlined absolute right-space-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[20px]">unfold_more</span>
</div>
</div>
{/* Date Range Picker & Presets */}
<div className="flex flex-col gap-space-sm">
<label className="font-label-md text-label-md text-on-surface-variant font-medium">Intervalo Temporal & Resolução</label>
{/* Quick Range Preset Buttons */}
<div className="grid grid-cols-3 gap-space-sm">
<button className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-body-sm font-body-sm transition-colors text-center">
                Últimas 24h
              </button>
<button className="px-space-md py-space-xs rounded bg-primary-container text-on-primary-container text-body-sm font-body-sm font-medium transition-colors text-center shadow-sm">
                Semana Crítica (Ago/2026)
              </button>
<button className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-body-sm font-body-sm transition-colors text-center">
                Personalizado
              </button>
</div>
{/* Detailed Range Controls Input Grid */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-space-md bg-surface-container-lowest p-space-md rounded-lg shadow-inner">
<div className="flex flex-col gap-space-xs">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">Início da Série</span>
<div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-space-xs rounded text-on-surface font-data-mono-sm text-data-mono-sm">
<span className="material-symbols-outlined text-[16px] text-tertiary">calendar_today</span>
<span>01/08/2026 00:00</span>
</div>
</div>
<div className="flex flex-col gap-space-xs">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">Término da Série</span>
<div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-space-xs rounded text-on-surface font-data-mono-sm text-data-mono-sm">
<span className="material-symbols-outlined text-[16px] text-tertiary">event</span>
<span>15/08/2026 23:00</span>
</div>
</div>
<div className="flex flex-col gap-space-xs">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">Resolução Temporal</span>
<div className="flex items-center justify-between bg-surface-container px-space-sm py-space-xs rounded text-on-surface font-data-mono-sm text-data-mono-sm">
<span>Passo 1h (360 pontos)</span>
<span className="w-2 h-2 rounded-full bg-secondary"></span>
</div>
</div>
</div>
</div>
{/* Shadcn Style Alert Box */}
<div className="flex gap-space-md p-space-lg rounded-lg bg-surface-container-highest shadow-sm">
<span className="material-symbols-outlined text-secondary text-[22px] shrink-0 mt-0.5">info</span>
<div className="flex flex-col gap-space-xs">
<span className="font-body-md text-body-md text-on-surface font-semibold">Aviso de Corte de Dados Regulatórios</span>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                A base histórica <strong className="text-on-surface font-medium">ONS / ERA5</strong> com reanálise climática de alta resolução espacial (0.25° x 0.25°) está consolidada até <strong className="text-secondary font-medium">31/08/2026</strong>. Cenários posteriores utilizarão automaticamente a modelagem preditiva ensemble ClimaGrid AI.
              </p>
</div>
</div>
</div>
{/* Summary & Micro-Visualisation Column (5 cols) */}
<div className="lg:col-span-5 flex flex-col justify-between gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md">
<div className="flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Resumo do Perfil Climático</span>
<span className="material-symbols-outlined text-tertiary text-[20px]">analytics</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant">
              Estimativas agregadas para os clusters eólicos do Subsistema Nordeste no horizonte selecionado.
            </p>
{/* Metrics Bento Cards */}
<div className="grid grid-cols-1 gap-space-sm">
{/* Metric 1 */}
<div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-lowest shadow-inner">
<div className="flex items-center gap-space-md">
<div className="w-10 h-10 rounded-md bg-surface-container flex items-center justify-center text-secondary">
<span className="material-symbols-outlined text-[20px]">air</span>
</div>
<div className="flex flex-col">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Velocidade Média Prevista</span>
<span className="font-data-mono-lg text-data-mono-lg text-on-surface font-bold">9.4 <span className="text-body-sm text-outline font-normal">m/s</span></span>
</div>
</div>
<span className="px-space-sm py-space-xs rounded bg-surface-container text-tertiary font-data-mono-sm text-data-mono-sm">+14% vs. Histórico</span>
</div>
{/* Metric 2 */}
<div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-lowest shadow-inner">
<div className="flex items-center gap-space-md">
<div className="w-10 h-10 rounded-md bg-surface-container flex items-center justify-center text-tertiary">
<span className="material-symbols-outlined text-[20px]">explore</span>
</div>
<div className="flex flex-col">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Direção Predominante</span>
<span className="font-data-mono-lg text-data-mono-lg text-on-surface font-bold">ESE 112° <span className="text-body-sm text-outline font-normal">(Alísios de SE)</span></span>
</div>
</div>
<div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center">
<span className="material-symbols-outlined text-[16px] text-tertiary transform rotate-[112deg]">navigation</span>
</div>
</div>
{/* Metric 3 */}
<div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-lowest shadow-inner">
<div className="flex items-center gap-space-md">
<div className="w-10 h-10 rounded-md bg-surface-container flex items-center justify-center text-primary">
<span className="material-symbols-outlined text-[20px]">thermostat</span>
</div>
<div className="flex flex-col">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Densidade Média do Ar (ρ)</span>
<span className="font-data-mono-lg text-data-mono-lg text-on-surface font-bold">1.18 <span className="text-body-sm text-outline font-normal">kg/m³</span></span>
</div>
</div>
<span className="font-data-mono-sm text-data-mono-sm text-outline">T_amb = 28.4°C</span>
</div>
</div>
</div>
{/* Inline Visual: Wind Speed Distribution SVG Sparkline */}
<div className="flex flex-col gap-space-xs bg-surface-container-lowest p-space-md rounded-lg shadow-inner">
<div className="flex items-center justify-between">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Curva de Vento Horária (15 Dias)</span>
<span className="font-data-mono-sm text-data-mono-sm text-secondary font-medium">Pico: 13.8 m/s</span>
</div>
<div className="w-full h-16 relative">
<svg className="w-full h-full text-secondary" fill="none" preserveAspectRatio="none" viewBox="0 0 300 60">
<path d="M0,45 C20,40 35,20 60,25 C85,30 100,50 130,42 C160,34 180,10 210,14 C240,18 260,38 300,28 L300,60 L0,60 Z" fill="currentColor" fillOpacity="0.12"></path>
<path d="M0,45 C20,40 35,20 60,25 C85,30 100,50 130,42 C160,34 180,10 210,14 C240,18 260,38 300,28" stroke="currentColor" strokeLinecap="round" strokeWidth="2"></path>
</svg>
</div>
</div>
</div>
</div>
</div>
{/* 4. Tab Content B: Custom Scenario Upload & Schema Verification */}
<div className="hidden flex-col gap-space-xl" id="tab-upload-content">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
{/* Drag & Drop Area (6 cols) */}
<div className="lg:col-span-6 flex flex-col gap-space-md bg-surface-container-low p-space-xl rounded-xl shadow-md">
<div className="flex items-center justify-between">
<span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Upload de Dados Anemométricos</span>
<span className="font-data-mono-sm text-data-mono-sm text-outline">Max 25MB por lote</span>
</div>
{/* Interactive Drag and Drop Zone */}
<div className="flex flex-col items-center justify-center p-space-xl rounded-xl bg-surface-container-lowest hover:bg-surface-container-high/40 transition-all cursor-pointer group text-center gap-space-md shadow-inner">
<div className="w-14 h-14 rounded-full bg-surface-container-high group-hover:scale-110 group-hover:bg-primary-container text-tertiary group-hover:text-on-primary-container transition-all flex items-center justify-center">
<span className="material-symbols-outlined text-[28px]">upload_file</span>
</div>
<div className="flex flex-col gap-space-xs">
<p className="font-body-md text-body-md text-on-surface font-medium">
                Arraste seu arquivo de medição ou <span className="text-primary underline">procure no disco</span>
</p>
<p className="font-body-sm text-body-sm text-on-surface-variant">
                Compatível com séries temporais brutas em .CSV (separador ponto e vírgula ou vírgula) e .XLSX
              </p>
</div>
<div className="flex items-center gap-space-sm pt-space-xs">
<span className="px-space-sm py-space-xs rounded bg-surface-container text-on-surface-variant font-data-mono-sm text-data-mono-sm">UTF-8 / ISO-8859-1</span>
<span className="px-space-sm py-space-xs rounded bg-surface-container text-on-surface-variant font-data-mono-sm text-data-mono-sm">Torres & Lidar</span>
</div>
</div>
{/* Pre-loaded File Pill */}
<div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-highest shadow-sm">
<div className="flex items-center gap-space-md">
<span className="material-symbols-outlined text-secondary text-[24px]">description</span>
<div className="flex flex-col">
<span className="font-body-sm text-body-sm text-on-surface font-medium">cenario_nordeste_eolicas_agosto2026_rev4.csv</span>
<span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">14.8 MB • 350.400 registros detectados</span>
</div>
</div>
<button className="w-8 h-8 rounded flex items-center justify-center hover:bg-surface-container text-on-surface-variant hover:text-error transition-colors">
<span className="material-symbols-outlined text-[18px]">close</span>
</button>
</div>
{/* Mandatory Columns Schema Chips */}
<div className="flex flex-col gap-space-xs">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Schema Exigido (Validação Estrita CCEE/ONS)</span>
<div className="flex flex-wrap gap-space-xs">
<span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">timestamp [ISO8601]</span>
<span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">id_usina [VARCHAR]</span>
<span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">vel_vento_ms [FLOAT]</span>
<span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">dir_vento_deg [INT]</span>
<span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">pressao_hpa [FLOAT]</span>
<span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">temp_c [FLOAT]</span>
</div>
</div>
</div>
{/* Schema Real-Time Validation Box & Error Diagnostics (6 cols) */}
<div className="lg:col-span-6 flex flex-col gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md">
<div className="flex items-center justify-between">
<span className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-space-sm">
<span className="material-symbols-outlined text-error text-[20px]">fact_check</span>
              Diagnóstico de Integridade de Dados
            </span>
<span className="px-space-sm py-space-xs rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold uppercase">2 Falhas de Consistência</span>
</div>
{/* Badges de Tipagem e Integridade */}
<div className="grid grid-cols-3 gap-space-sm">
<div className="flex flex-col p-space-sm rounded-lg bg-surface-container-lowest shadow-inner">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Tipagem Escalar</span>
<span className="font-data-mono-sm text-data-mono-sm text-tertiary font-semibold flex items-center gap-space-xs mt-1">
<span className="material-symbols-outlined text-[14px]">check_circle</span> 100% OK
              </span>
</div>
<div className="flex flex-col p-space-sm rounded-lg bg-surface-container-lowest shadow-inner">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Valores Nulos / NaN</span>
<span className="font-data-mono-sm text-data-mono-sm text-tertiary font-semibold flex items-center gap-space-xs mt-1">
<span className="material-symbols-outlined text-[14px]">check_circle</span> 0 Nulos
              </span>
</div>
<div className="flex flex-col p-space-sm rounded-lg bg-surface-container-lowest shadow-inner">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Passo Temporal</span>
<span className="font-data-mono-sm text-data-mono-sm text-secondary font-semibold flex items-center gap-space-xs mt-1">
<span className="material-symbols-outlined text-[14px]">history_toggle_off</span> Δt = 1h contínuo
              </span>
</div>
</div>
{/* Detailed Error List Container */}
<div className="flex flex-col gap-space-sm">
<span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Inconsistências Físicas Detectadas</span>
{/* Error Item 1 */}
<div className="flex items-start gap-space-md p-space-md rounded-lg bg-error-container/20 text-on-surface shadow-sm">
<span className="material-symbols-outlined text-error text-[20px] shrink-0 mt-0.5">warning</span>
<div className="flex flex-col gap-space-xs">
<span className="font-data-mono-sm text-data-mono-sm font-semibold text-error">Linha 142 • Anemômetro Usina EOL_SENTO_SE_03</span>
<p className="font-body-sm text-body-sm text-on-surface-variant">
                  Valor recebido: <code className="text-error font-data-mono-sm">vel_vento_ms = -3.2 m/s</code>. Inválido: velocidade física do vento não pode ser negativa ou superior a 50.0 m/s no padrão SIN.
                </p>
</div>
</div>
{/* Error Item 2 */}
<div className="flex items-start gap-space-md p-space-md rounded-lg bg-error-container/20 text-on-surface shadow-sm">
<span className="material-symbols-outlined text-error text-[20px] shrink-0 mt-0.5">warning</span>
<div className="flex flex-col gap-space-xs">
<span className="font-data-mono-sm text-data-mono-sm font-semibold text-error">Linha 280 • Cata-vento Usina EOL_IGAPORA_01</span>
<p className="font-body-sm text-body-sm text-on-surface-variant">
                  Valor recebido: <code className="text-error font-data-mono-sm">dir_vento_deg = 415°</code>. Inválido: azimute meteorológico deve respeitar o intervalo geométrico fechado [0°, 360°].
                </p>
</div>
</div>
</div>
{/* Quick Autofix Option */}
<div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-highest shadow-inner mt-auto">
<div className="flex items-center gap-space-sm">
<span className="material-symbols-outlined text-tertiary text-[18px]">auto_fix_high</span>
<span className="font-body-sm text-body-sm text-on-surface">Substituir anomalias por interpolação de spline cúbica?</span>
</div>
<button className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-tertiary text-body-sm font-medium transition-colors">
              Aplicar Correção
            </button>
</div>
</div>
</div>
</div>
</div>
{/* 5. Operational Action Footer */}
<div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-md">
<button className="w-full sm:w-auto px-space-xl py-space-md rounded-lg bg-surface-container-high hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium transition-colors shadow-sm flex items-center justify-center gap-space-sm">
<span className="material-symbols-outlined text-[18px]">restart_alt</span>
      Restaurar Padrões ONS
    </button>
<div className="flex items-center gap-space-md w-full sm:w-auto">
<a className="w-full sm:w-auto px-space-xl py-space-md rounded-lg bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-body-sm text-body-sm font-semibold transition-all shadow-md flex items-center justify-center gap-space-sm" data-path="usinas-estimativas" href="#">
<span>Processar Estimativas de Geração</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</a>
</div>
</div>
</div>
</main><footer className="w-full bg-surface-container-lowest px-space-xl py-space-md flex flex-col md:flex-row items-center justify-between gap-space-sm"><div className="flex items-center gap-space-lg text-on-surface-variant"><span className="font-label-sm text-label-sm uppercase tracking-wider">Conformidade Regulatória: ONS / CCEE Módulo 26</span><span className="font-label-sm text-label-sm text-outline">•</span><span className="font-label-sm text-label-sm uppercase tracking-wider">Formatos PWF / ANAREDE Oficial</span></div><div className="flex items-center gap-space-sm"><span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">ClimaGrid Engine Core v3.8.4</span><span className="font-label-sm text-label-sm text-outline">|</span><span className="font-data-mono-sm text-data-mono-sm text-secondary">2025 SIN Analytics Corp</span></div></footer></div>
    </>
  );
}
