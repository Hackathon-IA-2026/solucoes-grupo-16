'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import Link from 'next/link';

export default function MapeamentoBarrasPage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [isMatchComplete, setIsMatchComplete] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleAutoMatch = () => {
    setIsAutoMatching(true);
    setTimeout(() => {
      setIsAutoMatching(false);
      setIsMatchComplete(true);
      setTimeout(() => setIsMatchComplete(false), 3000);
    }, 1200);
  };

  const handleCopy = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <AppShell>
      <div className="flex flex-col w-full">
        {/* Dynamic Notification Bar / Context Ribbon */}
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-space-md p-space-lg mb-space-lg rounded-xl bg-surface-container-high shadow-md">
          <div className="flex items-center gap-space-md min-w-0">
            <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-secondary text-[22px]">account_tree</span>
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
              onClick={() => setIsDrawerOpen(true)}
            >
              <span className="material-symbols-outlined text-[18px] text-tertiary">terminal</span>
              <span className="font-label-md text-label-md">Cartões PWF (DBAR/DGER)</span>
              <span className="w-2 h-2 rounded-full bg-secondary animate-ping"></span>
            </button>
            <button 
              className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-secondary-container hover:bg-secondary text-on-secondary font-medium transition-all shadow-sm"
              onClick={handleAutoMatch}
            >
              {isAutoMatching ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                  <span className="font-label-md text-label-md">Associando 3 nós via KNN...</span>
                </>
              ) : isMatchComplete ? (
                <>
                  <span className="material-symbols-outlined text-[18px]">done_all</span>
                  <span className="font-label-md text-label-md">100% Barras Resolvidas!</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
                  <span className="font-label-md text-label-md">Auto-Preencher por Proximidade (IA)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Scenario Toolbar & Progress Rail */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-lg">
          {/* Scenario Management Box */}
          <div className="lg:col-span-8 p-space-lg rounded-xl bg-surface-container shadow-md flex flex-col justify-between gap-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-tertiary text-[18px]">bookmarks</span>
                <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Gerenciador de Topologias Salvas</span>
              </div>
              <span className="font-data-mono-sm text-data-mono-sm text-outline">PWF-SYNC ID: #SIN-8902-REV4</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-space-sm w-full">
              <div className="relative flex-1 w-full">
                <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-outline text-[18px]">edit_note</span>
                <input className="w-full bg-surface-container-lowest text-on-surface pl-10 pr-space-md py-space-sm rounded font-body-md text-body-md focus:outline-none focus:bg-surface-container-low transition-colors" placeholder="Nome do cenário..." type="text" defaultValue="Estudo Ventos Fortes Ago/2026 - Ponto Máximo Noturno"/>
              </div>
              <button className="w-full sm:w-auto px-space-md py-space-sm rounded bg-primary-container text-on-primary-container font-label-md text-label-md hover:bg-inverse-primary transition-all shrink-0 flex items-center justify-center gap-space-xs shadow-sm">
                <span className="material-symbols-outlined text-[16px]">save</span>
                <span>Salvar Cenário</span>
              </button>
              <div className="relative w-full sm:w-auto">
                <select className="w-full sm:w-64 appearance-none bg-surface-container-low text-on-surface pl-space-md pr-8 py-space-sm rounded font-body-md text-body-md focus:outline-none cursor-pointer">
                  <option value="base_2026">Base Padrão ONS 2026</option>
                  <option value="eixo_500">Cenário Crítico Eixo 500kV NE</option>
                  <option value="se_ne_rev2">Deck SE/NE Curtailment Máx</option>
                  <option value="subsistema_n">Fluxo N-NE Intercâmbio Elevado</option>
                </select>
                <span className="material-symbols-outlined absolute right-space-sm top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[18px]">expand_more</span>
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

          {/* Mapping Readiness Metric Card */}
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
              <span className="material-symbols-outlined text-error text-[16px] shrink-0 mt-0.5">warning</span>
              <p className="font-label-sm text-label-sm leading-tight">
                Restam 3 usinas sem barra associada. O arquivo PWF exige 100% de preenchimento para compilar sem erros de ilhamento.
              </p>
            </div>
          </div>
        </div>

        {/* Primary Work Area: The "De-Para" Bus Association Table */}
        <div className="w-full rounded-xl bg-surface-container shadow-md overflow-hidden mb-space-lg">
          {/* Table Sub-Header Controls */}
          <div className="p-space-md bg-surface-container-high flex flex-col sm:flex-row items-center justify-between gap-space-sm">
            <div className="flex items-center gap-space-sm w-full sm:w-auto">
              <div className="relative w-full sm:w-80">
                <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-outline text-[16px]">search</span>
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
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
              </button>
              <button className="p-1.5 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          </div>

          {/* Scrollable Dense Table Canvas */}
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                  <th className="py-space-sm px-space-md">Usina Geradora (Tela 2)</th>
                  <th className="py-space-sm px-space-xs text-center">Topol.</th>
                  <th className="py-space-sm px-space-md">Nº Barra (DBAR)</th>
                  <th className="py-space-sm px-space-md min-w-[220px]">Nome da Barra SIN</th>
                  <th className="py-space-sm px-space-md">Tensão (kV)</th>
                  <th className="py-space-sm px-space-md min-w-[190px]">Área Operativa ONS</th>
                  <th className="py-space-sm px-space-md">Status Validação</th>
                  <th className="py-space-sm px-space-md text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-transparent font-body-sm text-body-sm text-on-surface">
                {/* Row 1 */}
                <tr className="hover:bg-surface-container-high/60 transition-colors bg-surface-container">
                  <td className="py-space-sm px-space-md">
                    <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">EOL Ventos do Santo Agostinho I</span>
                      <div className="flex items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        <span className="text-tertiary">ONS-EOL-RN-0981</span>
                        <span>•</span>
                        <span>RN</span>
                        <span>•</span>
                        <span className="text-primary font-medium">180.0 MW</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-space-sm px-space-xs text-center">
                    <span className="material-symbols-outlined text-tertiary text-[18px]">trending_flat</span>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-24 bg-surface-container-lowest font-data-mono-md text-data-mono-md text-secondary px-space-sm py-1 rounded text-right focus:outline-none focus:bg-surface-container-high" type="number" defaultValue="3412"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-full bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded uppercase focus:outline-none focus:bg-surface-container-high" type="text" defaultValue="SE MOSSORO IV 500"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded focus:outline-none" defaultValue="500">
                      <option value="500">500 kV</option>
                      <option value="230">230 kV</option>
                      <option value="138">138 kV</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-body-sm text-body-sm text-on-surface px-space-sm py-1 rounded focus:outline-none w-full" defaultValue="32">
                      <option value="32">Área 32 - RN/CE</option>
                      <option value="44">Área 44 - Bahia Norte</option>
                      <option value="51">Área 51 - Piauí Leste</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-primary/10 text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      Validada
                    </span>
                  </td>
                  <td className="py-space-sm px-space-md text-right">
                    <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
                      <span className="material-symbols-outlined text-[16px]">more_vert</span>
                    </button>
                  </td>
                </tr>

                {/* Row 2 */}
                <tr className="hover:bg-surface-container-high/60 transition-colors bg-surface-container-low">
                  <td className="py-space-sm px-space-md">
                    <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">UFV Morro do Chapéu Solar II</span>
                      <div className="flex items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        <span className="text-tertiary">ONS-SOL-BA-4421</span>
                        <span>•</span>
                        <span>BA</span>
                        <span>•</span>
                        <span className="text-primary font-medium">120.5 MW</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-space-sm px-space-xs text-center">
                    <span className="material-symbols-outlined text-tertiary text-[18px]">trending_flat</span>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-24 bg-surface-container-lowest font-data-mono-md text-data-mono-md text-secondary px-space-sm py-1 rounded text-right focus:outline-none focus:bg-surface-container-high" type="number" defaultValue="4520"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-full bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded uppercase focus:outline-none focus:bg-surface-container-high" type="text" defaultValue="SE MORRO CHAPEU 230"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded focus:outline-none" defaultValue="230">
                      <option value="500">500 kV</option>
                      <option value="230">230 kV</option>
                      <option value="138">138 kV</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-body-sm text-body-sm text-on-surface px-space-sm py-1 rounded focus:outline-none w-full" defaultValue="44">
                      <option value="32">Área 32 - RN/CE</option>
                      <option value="44">Área 44 - Bahia Norte</option>
                      <option value="51">Área 51 - Piauí Leste</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-primary/10 text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      Validada
                    </span>
                  </td>
                  <td className="py-space-sm px-space-md text-right">
                    <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
                      <span className="material-symbols-outlined text-[16px]">more_vert</span>
                    </button>
                  </td>
                </tr>

                {/* Row 3 */}
                <tr className="hover:bg-surface-container-high/60 transition-colors bg-surface-container">
                  <td className="py-space-sm px-space-md">
                    <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">EOL Chapada do Piauí V</span>
                      <div className="flex items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        <span className="text-tertiary">ONS-EOL-PI-1049</span>
                        <span>•</span>
                        <span>PI</span>
                        <span>•</span>
                        <span className="text-primary font-medium">95.4 MW</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-space-sm px-space-xs text-center">
                    <span className="material-symbols-outlined text-outline text-[18px]">trending_flat</span>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <div className="relative">
                      <input className="w-24 bg-error-container/30 text-error font-data-mono-md text-data-mono-md px-space-sm py-1 rounded text-right focus:outline-none" placeholder="0000" type="number"/>
                    </div>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-full bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface-variant px-space-sm py-1 rounded uppercase focus:outline-none" placeholder="DEFINIR SUBESTAÇÃO..." type="text"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded focus:outline-none" defaultValue="230">
                      <option value="500">500 kV</option>
                      <option value="230">230 kV</option>
                      <option value="138">138 kV</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-body-sm text-body-sm text-on-surface px-space-sm py-1 rounded focus:outline-none w-full" defaultValue="51">
                      <option value="32">Área 32 - RN/CE</option>
                      <option value="44">Área 44 - Bahia Norte</option>
                      <option value="51">Área 51 - Piauí Leste</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-error-container/40 text-on-error-container">
                      <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
                      Pendente de Número
                    </span>
                  </td>
                  <td className="py-space-sm px-space-md text-right">
                    <button className="px-2 py-1 rounded bg-secondary-container/30 text-secondary hover:bg-secondary-container hover:text-on-secondary-container font-label-sm text-label-sm transition-all">
                      Sugerir
                    </button>
                  </td>
                </tr>

                {/* Row 4 */}
                <tr className="hover:bg-surface-container-high/60 transition-colors bg-surface-container-low">
                  <td className="py-space-sm px-space-md">
                    <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">EOL Serra da Babilônia III</span>
                      <div className="flex items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        <span className="text-tertiary">ONS-EOL-BA-7742</span>
                        <span>•</span>
                        <span>BA</span>
                        <span>•</span>
                        <span className="text-primary font-medium">210.0 MW</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-space-sm px-space-xs text-center">
                    <span className="material-symbols-outlined text-outline text-[18px]">trending_flat</span>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-24 bg-surface-container-lowest font-data-mono-md text-data-mono-md text-secondary px-space-sm py-1 rounded text-right focus:outline-none" type="number" defaultValue="8910"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-full bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded uppercase focus:outline-none" type="text" defaultValue="SE JUAZEIRO III 500"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-error-container/30 font-data-mono-sm text-data-mono-sm text-error px-space-sm py-1 rounded focus:outline-none font-medium" defaultValue="138">
                      <option value="138">138 kV</option>
                      <option value="230">230 kV</option>
                      <option value="500">500 kV</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-body-sm text-body-sm text-on-surface px-space-sm py-1 rounded focus:outline-none w-full" defaultValue="44">
                      <option value="32">Área 32 - RN/CE</option>
                      <option value="44">Área 44 - Bahia Norte</option>
                      <option value="51">Área 51 - Piauí Leste</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-tertiary-container/40 text-on-tertiary-container">
                      <span className="material-symbols-outlined text-[12px]">sync_problem</span>
                      Alerta: Tensão Incompatível
                    </span>
                  </td>
                  <td className="py-space-sm px-space-md text-right">
                    <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
                      <span className="material-symbols-outlined text-[16px]">more_vert</span>
                    </button>
                  </td>
                </tr>

                {/* Row 5 */}
                <tr className="hover:bg-surface-container-high/60 transition-colors bg-surface-container">
                  <td className="py-space-sm px-space-md">
                    <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Complexo Solar São Gonçalo</span>
                      <div className="flex items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        <span className="text-tertiary">ONS-SOL-PI-8891</span>
                        <span>•</span>
                        <span>PI</span>
                        <span>•</span>
                        <span className="text-primary font-medium">475.0 MW</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-space-sm px-space-xs text-center">
                    <span className="material-symbols-outlined text-tertiary text-[18px]">trending_flat</span>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-24 bg-surface-container-lowest font-data-mono-md text-data-mono-md text-secondary px-space-sm py-1 rounded text-right focus:outline-none" type="number" defaultValue="6721"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-full bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded uppercase focus:outline-none" type="text" defaultValue="SE SAO JOAO PIAUI 500"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded focus:outline-none" defaultValue="500">
                      <option value="500">500 kV</option>
                      <option value="230">230 kV</option>
                      <option value="138">138 kV</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-body-sm text-body-sm text-on-surface px-space-sm py-1 rounded focus:outline-none w-full" defaultValue="51">
                      <option value="32">Área 32 - RN/CE</option>
                      <option value="44">Área 44 - Bahia Norte</option>
                      <option value="51">Área 51 - Piauí Leste</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-primary/10 text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      Validada
                    </span>
                  </td>
                  <td className="py-space-sm px-space-md text-right">
                    <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
                      <span className="material-symbols-outlined text-[16px]">more_vert</span>
                    </button>
                  </td>
                </tr>

                {/* Row 6 */}
                <tr className="hover:bg-surface-container-high/60 transition-colors bg-surface-container-low">
                  <td className="py-space-sm px-space-md">
                    <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">EOL Coxigola Ventos da Paraíba</span>
                      <div className="flex items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        <span className="text-tertiary">ONS-EOL-PB-0238</span>
                        <span>•</span>
                        <span>PB</span>
                        <span>•</span>
                        <span className="text-primary font-medium">135.0 MW</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-space-sm px-space-xs text-center">
                    <span className="material-symbols-outlined text-tertiary text-[18px]">trending_flat</span>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-24 bg-surface-container-lowest font-data-mono-md text-data-mono-md text-secondary px-space-sm py-1 rounded text-right focus:outline-none" type="number" defaultValue="7823"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <input className="w-full bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded uppercase focus:outline-none" type="text" defaultValue="SE CAMPINA GRANDE 500"/>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded focus:outline-none" defaultValue="500">
                      <option value="500">500 kV</option>
                      <option value="230">230 kV</option>
                      <option value="138">138 kV</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <select className="bg-surface-container-lowest font-body-sm text-body-sm text-on-surface px-space-sm py-1 rounded focus:outline-none w-full" defaultValue="32">
                      <option value="32">Área 32 - RN/CE</option>
                      <option value="44">Área 44 - Bahia Norte</option>
                      <option value="51">Área 51 - Piauí Leste</option>
                    </select>
                  </td>
                  <td className="py-space-sm px-space-md">
                    <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-primary/10 text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      Validada
                    </span>
                  </td>
                  <td className="py-space-sm px-space-md text-right">
                    <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
                      <span className="material-symbols-outlined text-[16px]">more_vert</span>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-space-lg py-space-sm bg-surface-container-low flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
            <div className="flex items-center gap-space-sm">
              <span>Exibindo 6 de 24 registros mapeados</span>
              <span>•</span>
              <span className="text-tertiary">Deck ONS Oficial 2024/04 - Rev 2</span>
            </div>
            <div className="flex items-center gap-space-xs">
              <button className="px-2 py-1 rounded bg-surface-container text-on-surface opacity-50 cursor-not-allowed">Anterior</button>
              <span className="px-2 py-1 rounded bg-primary-container text-on-primary-container">1</span>
              <button className="px-2 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high">2</button>
              <button className="px-2 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high">3</button>
              <button className="px-2 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high">Próxima</button>
            </div>
          </div>
        </div>

        {/* Bento Telemetry Strip & Electrical Statistics Footer */}
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
                <span className="material-symbols-outlined text-[18px]">replay</span>
                <span>Limpar</span>
              </button>
              <Link href="/exportacao-pwf-curtailment" className="flex-1 px-space-md py-space-sm rounded bg-primary-container hover:bg-inverse-primary text-on-primary-container font-headline-sm text-headline-sm font-semibold transition-all shadow-md flex items-center justify-center gap-space-sm">
                <span>Avançar para Exportação e Risco</span>
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Shadcn Style Slide-Over Drawer / Sheet for PWF Output Preview */}
      <aside 
        className={`fixed top-0 right-0 h-full w-full sm:w-[540px] bg-surface-container-lowest z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col justify-between ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="h-16 px-space-lg bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-secondary text-[22px]">code</span>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Sintaxe PWF: DBAR / DGER</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Deck formatado em colunas ANAREDE/CEPEL</span>
            </div>
          </div>
          <button 
            className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            onClick={() => setIsDrawerOpen(false)}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        {/* Monospace Terminal Code Area */}
        <div className="flex-1 p-space-lg overflow-y-auto font-data-mono-sm text-data-mono-sm bg-surface-container-lowest text-secondary-fixed-dim leading-relaxed">
          <div className="p-space-sm rounded bg-surface-container-high/40 text-on-surface-variant mb-space-md">
            <p className="font-label-sm text-label-sm uppercase">Colunas Oficiais: NUM(1-5), OPER(6), EST(7), TIP(8), GRU(9-10), NOME(11-22), V(25-28), ANG(29-32), PG(33-37), QG(38-42)</p>
          </div>
          {/* Raw PWF Card Emulation */}
          <pre className="text-tertiary select-all">{`TITU
ESTUDO ONS 2026/08 - CENARIO NOTURNO MAXIMO VENTO - EXP NE-SE
DBAR
(NUM)O E T GR (   NOME   )  V(KV)  ANG   PG(MW)  QG(MVAR) QM(MVAR)
 3412 D   0 32 MOSSORO IV   500.0  -2.1  180.00   12.40   50.00
 4520 D   0 44 MORRO CHAPEU 230.0  -4.5  120.50    5.10   35.00
 8910 D   0 44 JUAZEIRO III 500.0  -1.8  210.00   18.20   60.00
 6721 D   0 51 SAO JOAO PI  500.0  -3.2  475.00   32.00  120.00
 7823 D   0 32 CAMPINA GD   500.0  -0.9  135.00    9.50   40.00
99999
DGER
(NUM) (GL) (PMAX) (PMIN) (QMAX) (QMIN)
 3412    1 180.00   0.00  50.00 -30.00
 4520    1 120.50   0.00  35.00 -20.00
 8910    1 210.00   0.00  60.00 -40.00
 6721    1 475.00   0.00 120.00 -70.00
 7823    1 135.00   0.00  40.00 -25.00
99999
DINC
(DE ) (PARA) (NC) (XKM ) (RESIST) (REAC) (SUSCEP)
 3412  8910   1   142.5   0.0120  0.0890   0.1420
 4520  8910   1    98.2   0.0210  0.1140   0.0890
99999
FIM`}</pre>
        </div>
        {/* Drawer Footer Actions */}
        <div className="p-space-md bg-surface-container-low flex items-center justify-between gap-space-sm">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <span className="w-2 h-2 rounded-full bg-tertiary"></span>
            <span>Checksum: 0x88F2B</span>
          </div>
          <div className="flex items-center gap-space-sm">
            <button 
              className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-space-xs transition-colors"
              onClick={handleCopy}
            >
              {isCopied ? (
                <>
                  <span className="material-symbols-outlined text-[16px] text-tertiary">check</span>
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  <span>Copiar Cartões</span>
                </>
              )}
            </button>
            <button className="px-space-md py-space-xs rounded bg-primary-container hover:bg-inverse-primary text-on-primary-container font-label-md text-label-md transition-colors">
              Baixar .PWF
            </button>
          </div>
        </div>
      </aside>
    </AppShell>
  );
}
