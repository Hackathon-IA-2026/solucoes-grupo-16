'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import Link from 'next/link';

export default function ExportacaoPwfCurtailmentPage() {
  const [isCompleteScenario, setIsCompleteScenario] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  const toggleValidationScenario = () => {
    setIsCompleteScenario(!isCompleteScenario);
  };

  const triggerPwfDownload = () => {
    if (!isCompleteScenario) {
      alert('Exportação Bloqueada: Conclua o mapeamento das usinas na Tela 3.');
      return;
    }
    const filename = 'CLIMAGRID_D+1_NE_202505_REV02.PWF';
    alert('Download iniciado: ' + filename + ' pronto para importação direta no ANAREDE / Organon.');
  };

  return (
    <AppShell>
      <div className="flex flex-col w-full gap-space-xl">
        {/* Top Operational Header with Compliance Status */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-sm flex-wrap">
              <span className="font-label-sm text-label-sm uppercase tracking-widest text-secondary bg-surface-container-highest px-space-sm py-space-xs rounded">Módulo 26 ONS • CCEE Desk</span>
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                ANAREDE Kernel v11.4 Rev.03
              </span>
              <span className="font-data-mono-sm text-data-mono-sm text-outline">•</span>
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Deck Base: 2025/05-S1-NE</span>
            </div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Exportação de Estudo Elétrico e Matriz de Risco de Curtailment</h1>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl">
              Processamento estocástico de fluxo de potência ótimo (OPF), correlação meteorológica de vento para geração horária e cálculo de severidade de cortes físicos e regulatórios no Subsistema Nordeste.
            </p>
          </div>
          {/* Live Compliance Status Indicator */}
          <div className="flex items-center gap-space-md bg-surface-container p-space-md rounded-lg self-start lg:self-center shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[24px]">verified_user</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Conformidade Operativa</span>
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-space-xs">
                98.7% Estável
                <span className="w-2 h-2 rounded-full bg-tertiary"></span>
              </span>
              <span className="font-data-mono-sm text-data-mono-sm text-outline">Critério N-1 Ativo</span>
            </div>
          </div>
        </div>

        {/* Regulatory Highlight Alert: CNF Congestion Alert (Shadcn Alert styled) */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-space-lg shadow-md flex flex-col md:flex-row items-start gap-space-md">
          <div className="w-2 self-stretch bg-secondary rounded-full"></div>
          <div className="p-space-xs rounded-lg bg-surface-container-highest text-secondary flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">warning</span>
          </div>
          <div className="flex-1 flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-sm flex-wrap">
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">ALERTA CNF (Confiabilidade de Rede): Risco de Contingência em Tronco Estrutural</span>
              <span className="bg-surface-container-lowest text-secondary font-data-mono-sm text-data-mono-sm px-space-sm py-space-xs rounded">Interligação BA-MG 500kV</span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Risco potencial detectado em 5 usinas no tronco de 500kV Bahia-Minas. Pendente de validação no ANAREDE para verificação de sobrecarga em regime de contingência N-1 sob rajada eólica simultânea estimada em &gt; 11.8 m/s no corredor de Sobradinho/Juazeiro.
            </p>
          </div>
          <button className="bg-surface-container-lowest hover:bg-surface-container px-space-md py-space-sm rounded text-secondary font-body-sm text-body-sm font-medium transition-all flex items-center gap-space-xs whitespace-nowrap self-start md:self-center shadow-sm">
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span>Simular Despacho N-1</span>
          </button>
        </div>

        {/* 4 Official ONS Curtailment Categories Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-lg">
          {/* Card REL */}
          <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between gap-space-md shadow-sm">
            <div className="flex items-center justify-between">
              <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm uppercase font-semibold bg-surface-container-highest text-secondary">
                REL • ONS 3.1
              </span>
              <span className="material-symbols-outlined text-outline text-[20px]">bolt</span>
            </div>
            <div className="flex flex-col gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Restrição Elétrica Sistêmica</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-xl text-headline-xl text-on-surface font-bold">18.5%</span>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">corte previsto</span>
              </div>
            </div>
            <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
              <div className="bg-secondary h-full rounded-full" style={{ width: '18.5%' }}></div>
            </div>
            <div className="flex items-center justify-between font-data-mono-sm text-data-mono-sm text-on-surface-variant pt-space-xs">
              <span>6 usinas impactadas</span>
              <span className="text-on-surface font-semibold">280 MW em risco</span>
            </div>
          </div>
          {/* Card CNF */}
          <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between gap-space-md shadow-sm">
            <div className="flex items-center justify-between">
              <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm uppercase font-semibold bg-surface-container-highest text-primary">
                CNF • ONS 3.2
              </span>
              <span className="material-symbols-outlined text-outline text-[20px]">alt_route</span>
            </div>
            <div className="flex flex-col gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Congestionamento de Transmissão</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-xl text-headline-xl text-on-surface font-bold">14.2%</span>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">corte previsto</span>
              </div>
            </div>
            <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
              <div className="bg-primary h-full rounded-full" style={{ width: '14.2%' }}></div>
            </div>
            <div className="flex items-center justify-between font-data-mono-sm text-data-mono-sm text-on-surface-variant pt-space-xs">
              <span>5 usinas impactadas</span>
              <span className="text-on-surface font-semibold">215 MW em risco</span>
            </div>
          </div>
          {/* Card ENE */}
          <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between gap-space-md shadow-sm">
            <div className="flex items-center justify-between">
              <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm uppercase font-semibold bg-surface-container-highest text-tertiary">
                ENE • ONS 3.3
              </span>
              <span className="material-symbols-outlined text-outline text-[20px]">water_drop</span>
            </div>
            <div className="flex flex-col gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Excesso de Oferta / Inflexibilidade</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-xl text-headline-xl text-on-surface font-bold">8.4%</span>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">corte previsto</span>
              </div>
            </div>
            <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
              <div className="bg-tertiary h-full rounded-full" style={{ width: '8.4%' }}></div>
            </div>
            <div className="flex items-center justify-between font-data-mono-sm text-data-mono-sm text-on-surface-variant pt-space-xs">
              <span>3 usinas impactadas</span>
              <span className="text-on-surface font-semibold">120 MW em risco</span>
            </div>
          </div>
          {/* Card PAR */}
          <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between gap-space-md shadow-sm">
            <div className="flex items-center justify-between">
              <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm uppercase font-semibold bg-surface-container-highest text-error">
                PAR • ONS 3.4
              </span>
              <span className="material-symbols-outlined text-outline text-[20px]">construction</span>
            </div>
            <div className="flex flex-col gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Parada Programada / Manutenção</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-xl text-headline-xl text-on-surface font-bold">2.1%</span>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">corte programado</span>
              </div>
            </div>
            <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
              <div className="bg-error h-full rounded-full" style={{ width: '2.1%' }}></div>
            </div>
            <div className="flex items-center justify-between font-data-mono-sm text-data-mono-sm text-on-surface-variant pt-space-xs">
              <span>1 usina afetada</span>
              <span className="text-on-surface font-semibold">30 MW programados</span>
            </div>
          </div>
        </div>

        {/* Main Multi-pane Workbench: Severity Heatmap & Forecast Deck */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Plant Severity Matrix Table (8 cols) */}
          <div className="lg:col-span-8 flex flex-col bg-surface-container-low rounded-xl overflow-hidden shadow-md">
            <div className="p-space-lg bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-[20px]">reorder</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Matriz de Severidade e Mitigação por Usina</span>
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Análise de contingência horária (Janela Operativa D+1 14h00-18h00)</span>
              </div>
              <div className="flex items-center gap-space-sm">
                <div className="flex items-center gap-space-xs bg-surface-container-highest px-space-sm py-space-xs rounded">
                  <span className="material-symbols-outlined text-[14px] text-tertiary">tune</span>
                  <span className="font-label-sm text-label-sm uppercase text-on-surface font-medium">Filtro: Severidade Alta</span>
                </div>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">6 de 24 Usinas</span>
              </div>
            </div>
            {/* Data Table with Heatmap Indicators */}
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-space-md px-space-lg">Usina / Complexo</th>
                    <th className="py-space-md px-space-md">Barra Assoc.</th>
                    <th className="py-space-md px-space-md">Tensão</th>
                    <th className="py-space-md px-space-md text-right">Ger. Prevista</th>
                    <th className="py-space-md px-space-md text-right">Risco Curtailment</th>
                    <th className="py-space-md px-space-md text-center">Cat. Dominante</th>
                    <th className="py-space-md px-space-lg">Ação Operativa Recomendada</th>
                  </tr>
                </thead>
                <tbody className="font-body-md text-body-md divide-y-0">
                  {/* Row 1: High REL */}
                  <tr className="hover:bg-surface-container transition-colors bg-surface-container-low">
                    <td className="py-space-md px-space-lg font-medium text-on-surface flex items-center gap-space-sm">
                      <span className="w-2 h-2 rounded-full bg-secondary"></span>
                      <span className="truncate">[EOL-BA-CA01] Caetité Renováveis I</span>
                    </td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">#3412-CAET</td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">230 kV</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface">180 MW</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-secondary font-semibold">
                      <div className="flex items-center justify-end gap-space-xs">
                        <span>-75 MW</span>
                        <span className="font-label-sm text-label-sm text-outline">(41%)</span>
                      </div>
                    </td>
                    <td className="py-space-md px-space-md text-center">
                      <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm font-semibold bg-surface-container-highest text-secondary">
                        REL
                      </span>
                    </td>
                    <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface-variant">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[14px] text-secondary">arrow_drop_down</span>
                        <span>Limite de Injeção na Barra 3412</span>
                      </div>
                    </td>
                  </tr>
                  {/* Row 2: High CNF */}
                  <tr className="hover:bg-surface-container transition-colors bg-surface-container">
                    <td className="py-space-md px-space-lg font-medium text-on-surface flex items-center gap-space-sm">
                      <span className="w-2 h-2 rounded-full bg-primary"></span>
                      <span className="truncate">[EOL-BA-GB02] Gentio do Ouro Bio</span>
                    </td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">#3890-IREC</td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">500 kV</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface">220 MW</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-primary font-semibold">
                      <div className="flex items-center justify-end gap-space-xs">
                        <span>-90 MW</span>
                        <span className="font-label-sm text-label-sm text-outline">(40%)</span>
                      </div>
                    </td>
                    <td className="py-space-md px-space-md text-center">
                      <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm font-semibold bg-surface-container-highest text-primary">
                        CNF
                      </span>
                    </td>
                    <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface-variant">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[14px] text-primary">swap_horiz</span>
                        <span>Redispatch Preventivo Interligação SE</span>
                      </div>
                    </td>
                  </tr>
                  {/* Row 3: Medium REL */}
                  <tr className="hover:bg-surface-container transition-colors bg-surface-container-low">
                    <td className="py-space-md px-space-lg font-medium text-on-surface flex items-center gap-space-sm">
                      <span className="w-2 h-2 rounded-full bg-secondary"></span>
                      <span className="truncate">[EOL-RN-MR03] Morro do Chapéu Sul</span>
                    </td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">#4120-MCHU</td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">230 kV</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface">150 MW</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-secondary font-semibold">
                      <div className="flex items-center justify-end gap-space-xs">
                        <span>-40 MW</span>
                        <span className="font-label-sm text-label-sm text-outline">(26%)</span>
                      </div>
                    </td>
                    <td className="py-space-md px-space-md text-center">
                      <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm font-semibold bg-surface-container-highest text-secondary">
                        REL
                      </span>
                    </td>
                    <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface-variant">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[14px] text-secondary">build_circle</span>
                        <span>Ajuste de Tap em Transformador T1</span>
                      </div>
                    </td>
                  </tr>
                  {/* Row 4: ENE Excess */}
                  <tr className="hover:bg-surface-container transition-colors bg-surface-container">
                    <td className="py-space-md px-space-lg font-medium text-on-surface flex items-center gap-space-sm">
                      <span className="w-2 h-2 rounded-full bg-tertiary"></span>
                      <span className="truncate">[EOL-PI-LC05] Lagoa dos Ventos II</span>
                    </td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">#5022-SJPI</td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">500 kV</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface">390 MW</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-tertiary font-semibold">
                      <div className="flex items-center justify-end gap-space-xs">
                        <span>-60 MW</span>
                        <span className="font-label-sm text-label-sm text-outline">(15%)</span>
                      </div>
                    </td>
                    <td className="py-space-md px-space-md text-center">
                      <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm font-semibold bg-surface-container-highest text-tertiary">
                        ENE
                      </span>
                    </td>
                    <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface-variant">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[14px] text-tertiary">schedule</span>
                        <span>Modulação em Rampa Hidráulica Sobradinho</span>
                      </div>
                    </td>
                  </tr>
                  {/* Row 5: PAR Scheduled */}
                  <tr className="hover:bg-surface-container transition-colors bg-surface-container-low">
                    <td className="py-space-md px-space-lg font-medium text-on-surface flex items-center gap-space-sm">
                      <span className="w-2 h-2 rounded-full bg-error"></span>
                      <span className="truncate">[EOL-RN-AS08] Asa Branca V</span>
                    </td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">#2210-JOAM</td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">138 kV</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface">90 MW</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-error font-semibold">
                      <div className="flex items-center justify-end gap-space-xs">
                        <span>-30 MW</span>
                        <span className="font-label-sm text-label-sm text-outline">(33%)</span>
                      </div>
                    </td>
                    <td className="py-space-md px-space-md text-center">
                      <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm font-semibold bg-surface-container-highest text-error">
                        PAR
                      </span>
                    </td>
                    <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface-variant">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[14px] text-error">construction</span>
                        <span>Manutenção em Bay de Saída (TA-04)</span>
                      </div>
                    </td>
                  </tr>
                  {/* Row 6: Low risk */}
                  <tr className="hover:bg-surface-container transition-colors bg-surface-container">
                    <td className="py-space-md px-space-lg font-medium text-on-surface flex items-center gap-space-sm">
                      <span className="w-2 h-2 rounded-full bg-outline"></span>
                      <span className="truncate">[EOL-BA-SM01] Serra da Babilônia III</span>
                    </td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">#3915-OURO</td>
                    <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">230 kV</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface">110 MW</td>
                    <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface-variant">
                      <div className="flex items-center justify-end gap-space-xs">
                        <span>0 MW</span>
                        <span className="font-label-sm text-label-sm text-outline">(0%)</span>
                      </div>
                    </td>
                    <td className="py-space-md px-space-md text-center">
                      <span className="px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm text-outline bg-surface-container-highest">
                        OK
                      </span>
                    </td>
                    <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface-variant">
                      <span className="text-tertiary font-medium">Sem intervenção requerida</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Quick Table Footer Stats */}
            <div className="p-space-md bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-space-sm font-data-mono-sm text-data-mono-sm text-on-surface-variant">
              <span>Corte Total Projetado no Bloco: <strong className="text-secondary">645 MW</strong> (26.3% da Capacidade Ativa)</span>
              <span>Algoritmo: Newton-Raphson com Limite de Q Automático</span>
            </div>
          </div>
          {/* Visual Analytics & Submarket Flow Chart Widget (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-space-lg">
            {/* Curtailment Horizon Time Series Card */}
            <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col gap-space-md shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Perfil Horário de Despacho vs Cap</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Trajetória D+1 (MW Médio por Hora)</span>
                </div>
                <span className="material-symbols-outlined text-secondary text-[20px]">show_chart</span>
              </div>
              {/* Inline SVG Visualization (Horizon Curtailment Area Curve) */}
              <div className="w-full h-44 bg-surface-container rounded-lg p-space-sm relative overflow-hidden flex flex-col justify-end">
                <svg className="w-full h-32" preserveAspectRatio="none" viewBox="0 0 300 100">
                  <defs>
                    <linearGradient id="gradientCurtailment" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#89ceff" stopOpacity="0.45"></stop>
                      <stop offset="100%" stopColor="#89ceff" stopOpacity="0.0"></stop>
                    </linearGradient>
                    <linearGradient id="gradientGeneration" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2"></stop>
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0"></stop>
                    </linearGradient>
                  </defs>
                  {/* Background Grid lines */}
                  <line stroke="#434655" strokeDasharray="3 3" strokeOpacity="0.3" x1="0" x2="300" y1="25" y2="25"></line>
                  <line stroke="#434655" strokeDasharray="3 3" strokeOpacity="0.3" x1="0" x2="300" y1="50" y2="50"></line>
                  <line stroke="#434655" strokeDasharray="3 3" strokeOpacity="0.3" x1="0" x2="300" y1="75" y2="75"></line>
                  {/* Potential Available Generation Area */}
                  <polygon fill="url(#gradientCurtailment)" points="0,95 20,80 50,60 90,30 130,15 170,10 210,20 250,45 280,70 300,85 300,100 0,100"></polygon>
                  {/* Curtailment Cap (Dispatched Area) */}
                  <polygon fill="url(#gradientGeneration)" points="0,95 20,85 50,75 90,55 130,48 170,45 210,48 250,60 280,75 300,90 300,100 0,100"></polygon>
                  {/* Lines */}
                  <polyline fill="none" points="0,95 20,80 50,60 90,30 130,15 170,10 210,20 250,45 280,70 300,85" stroke="#89ceff" strokeWidth="2"></polyline>
                  <polyline fill="none" points="0,95 20,85 50,75 90,55 130,48 170,45 210,48 250,60 280,75 300,90" stroke="#2563eb" strokeDasharray="4 2" strokeWidth="2"></polyline>
                  {/* Highlight Peak Curtailment Point */}
                  <circle cx="170" cy="10" fill="#4cd7f6" r="3.5"></circle>
                  <circle cx="170" cy="45" fill="#2563eb" r="3.5"></circle>
                </svg>
                {/* SVG Legend & Metas */}
                <div className="flex items-center justify-between text-label-sm font-data-mono-sm pt-space-xs text-on-surface-variant">
                  <span className="flex items-center gap-space-xs"><span className="w-2 h-0.5 bg-secondary"></span>Potencial de Vento (P50)</span>
                  <span className="flex items-center gap-space-xs"><span className="w-2 h-0.5 bg-primary-container"></span>Despacho Autorizado (Cap)</span>
                  <span className="text-secondary font-bold">Delta: -645 MW</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-space-sm pt-space-xs">
                <div className="bg-surface-container p-space-sm rounded flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Gargalo Crítico</span>
                  <span className="font-data-mono-md text-data-mono-md text-on-surface font-semibold">16h30 - 18h00</span>
                  <span className="font-data-mono-sm text-data-mono-sm text-secondary">Risco N-1 Severo</span>
                </div>
                <div className="bg-surface-container p-space-sm rounded flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Perda Estimada</span>
                  <span className="font-data-mono-md text-data-mono-md text-error font-semibold">R$ 418.200,00</span>
                  <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">PLD Médio: R$ 145/MWh</span>
                </div>
              </div>
            </div>
            {/* Live ONS Dispatch Recommendations Box */}
            <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col gap-space-md shadow-md">
              <div className="flex items-center justify-between">
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Diretrizes do Operador (COSR-NE)</span>
                <span className="material-symbols-outlined text-tertiary text-[20px]">hub</span>
              </div>
              <ul className="flex flex-col gap-space-sm font-body-sm text-body-sm text-on-surface-variant">
                <li className="flex items-start gap-space-sm bg-surface-container p-space-sm rounded">
                  <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5">priority_high</span>
                  <span>Priorizar alívio em usinas tipo III conectadas em subestações de 230kV com fator de potência &lt; 0.98.</span>
                </li>
                <li className="flex items-start gap-space-sm bg-surface-container p-space-sm rounded">
                  <span className="material-symbols-outlined text-[16px] text-tertiary mt-0.5">info</span>
                  <span>Arquivo PWF gerado utilizará limites estáticos de transmissão definidos no Módulo 26 sub-rotina 4.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Mandatory Feature 4: PWF File Exporter & State Validation UI Rule */}
        <div className="bg-surface-container-low p-space-xl rounded-xl flex flex-col gap-space-lg shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-primary text-[24px]">terminal</span>
                <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">Exportação de Deck PWF e Validação Cadastral</h2>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Geração de arquivo texto compatível com ANAREDE (v11.4), Organon e simuladores de fluxo em corrente contínua/alternada.
              </p>
            </div>
            {/* State Simulation Switcher (Interactive Playground for Required UI Rule) */}
            <div className="flex items-center gap-space-sm bg-surface-container px-space-md py-space-sm rounded-lg shadow-sm">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Simulador de Estado:</span>
              <button 
                className="px-space-md py-space-xs rounded bg-surface-container-highest text-secondary hover:bg-surface-bright text-body-sm font-medium transition-all flex items-center gap-space-xs"
                onClick={toggleValidationScenario}
              >
                <span className="material-symbols-outlined text-[16px]">sync_alt</span>
                <span>{isCompleteScenario ? 'Alternar para: Cenário Incompleto' : 'Alternar para: Cenário 100% Mapeado'}</span>
              </button>
            </div>
          </div>
          {/* Active Scenario Banner: Conditional Alert Box */}
          <div>
            {/* Incomplete State Box */}
            {!isCompleteScenario && (
              <div className="bg-surface-container-high p-space-lg rounded-xl flex flex-col gap-space-md shadow-sm">
                <div className="flex items-start gap-space-md">
                  <div className="p-space-xs rounded-lg bg-surface-container-lowest text-error flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px]">error</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-space-xs">
                    <span className="font-headline-sm text-headline-sm text-error font-semibold">
                      Exportação Bloqueada: 3 de 24 usinas selecionadas na Tela 3 não possuem barra elétrica associada.
                    </span>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      O modelo matemático de fluxo de carga ANAREDE rejeita o arquivo caso existam cartões <code className="text-secondary font-data-mono-sm">DGER</code> sem a correspondente barra cadastrada em <code className="text-secondary font-data-mono-sm">DBAR</code>. Conclua a vinculação para habilitar a emissão do PWF.
                    </p>
                    {/* List of Pending Unmapped Plants */}
                    <div className="mt-space-sm bg-surface-container-lowest p-space-md rounded-lg flex flex-col gap-space-xs font-data-mono-sm text-data-mono-sm">
                      <span className="text-error font-bold uppercase tracking-wider text-label-sm">Lista das usinas pendentes de mapeamento elétrico:</span>
                      <div className="flex items-center gap-space-xs text-on-surface">
                        <span className="text-error font-bold">•</span>
                        <span className="font-semibold text-secondary">[EOL-CE-TR07]</span> Trairi Eólica (CE) - 90 MW - <span className="text-error">Barra não informada</span>
                      </div>
                      <div className="flex items-center gap-space-xs text-on-surface">
                        <span className="text-error font-bold">•</span>
                        <span className="font-semibold text-secondary">[EOL-BA-SB09]</span> Eólica Serra Branca IX (BA) - 140 MW - <span className="text-error">Barra não informada</span>
                      </div>
                      <div className="flex items-center gap-space-xs text-on-surface">
                        <span className="text-error font-bold">•</span>
                        <span className="font-semibold text-secondary">[EOL-RN-MI04]</span> Eólica Miassaba 3 (RN) - 65 MW - <span className="text-secondary">Tensão pendente (KV indesejado)</span>
                      </div>
                    </div>
                    <div className="pt-space-sm">
                      <Link className="inline-flex items-center gap-space-xs bg-surface-container hover:bg-surface-bright text-primary font-body-sm text-body-sm font-semibold px-space-md py-space-sm rounded transition-all" href="/mapeamento-barras">
                        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                        <span>Clique para retornar à Tela 3 e concluir o mapeamento</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Validated 100% Scenario Box (Default) */}
            {isCompleteScenario && (
              <div className="bg-surface-container-high p-space-md rounded-xl flex items-center justify-between gap-space-md shadow-sm">
                <div className="flex items-center gap-space-md">
                  <div className="p-space-xs rounded-lg bg-surface-container-lowest text-tertiary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px]">check_circle</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Integridade Topológica: 100% das Usinas Mapeadas (24/24)</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Todos os cartões DBAR, DGER e DLIN validados contra o Deck Oficial ONS 2025/04. Nenhuma inconsistência nodal detectada.</span>
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-xs rounded font-data-mono-sm text-data-mono-sm text-tertiary">
                  <span className="material-symbols-outlined text-[16px]">fingerprint</span>
                  <span>MD5: 7f4a21e88c</span>
                </div>
              </div>
            )}
          </div>

          {/* Action Toolbar & Buttons */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md pt-space-xs">
            {/* Mandatory Primary Button with Interactive State Control */}
            <div className="flex flex-col gap-space-xs">
              <div 
                className="relative group"
                onMouseEnter={() => !isCompleteScenario && setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <button 
                  className={`w-full md:w-auto px-space-xl py-space-md font-headline-sm text-headline-sm font-medium rounded-lg flex items-center justify-center gap-space-md transition-all shadow-md active:scale-98 ${
                    isCompleteScenario 
                      ? 'bg-primary-container hover:bg-primary-container/90 text-on-primary-container' 
                      : 'opacity-40 cursor-not-allowed bg-surface-variant text-outline'
                  }`}
                  onClick={triggerPwfDownload}
                  disabled={!isCompleteScenario}
                >
                  <span className="material-symbols-outlined text-[22px]">download_for_offline</span>
                  <div className="flex flex-col text-left">
                    <span>Gerar arquivo PWF (ANAREDE / Organon)</span>
                    <span className="font-label-sm text-label-sm opacity-80">Formato ANAREDE v11.4 • Cartões DBAR, DGER, DLIN, DCSC</span>
                  </div>
                </button>
                {/* Tooltip visible only when disabled and hovered */}
                {showTooltip && !isCompleteScenario && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-surface-container-lowest text-error font-data-mono-sm text-data-mono-sm px-space-md py-space-xs rounded shadow-lg">
                    Impossível exportar: 3 usinas com cadastro incompleto.
                  </div>
                )}
              </div>
            </div>
            {/* Secondary Export Buttons */}
            <div className="flex items-center gap-space-sm flex-wrap">
              <button className="flex-1 md:flex-none px-space-md py-space-sm bg-surface-container hover:bg-surface-container-highest text-on-surface font-body-sm text-body-sm font-medium rounded-lg transition-all flex items-center justify-center gap-space-xs shadow-sm">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">picture_as_pdf</span>
                <span>Exportar Relatório Executivo de Risco (PDF)</span>
              </button>
              <button className="flex-1 md:flex-none px-space-md py-space-sm bg-surface-container hover:bg-surface-container-highest text-on-surface font-body-sm text-body-sm font-medium rounded-lg transition-all flex items-center justify-center gap-space-xs shadow-sm">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">table_view</span>
                <span>Baixar Dados Tabulares (CSV)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mandatory Component 5: Live Syntactic Consistency Log Ready for ONS / CCEE Deck Submission */}
        <div className="bg-surface-container-low p-space-xl rounded-xl flex flex-col gap-space-md shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-secondary text-[20px]">code</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Log de Consistência Sintática e Prévia dos Cartões ANAREDE</h3>
            </div>
            <div className="flex items-center gap-space-sm font-data-mono-sm text-data-mono-sm text-on-surface-variant">
              <span className="w-2 h-2 rounded-full bg-tertiary"></span>
              <span>Sintaxe Estrita ONS Módulo 26 Validada</span>
            </div>
          </div>
          {/* Raw Monospace Syntax Staging Area */}
          <div className="w-full bg-surface-container-lowest p-space-lg rounded-lg overflow-x-auto font-data-mono-sm text-data-mono-sm text-on-surface-variant flex flex-col gap-space-xs shadow-inner">
            <div className="flex items-center justify-between text-outline pb-space-xs">
              <span>CARTÃO: TITU / DBAR / DGER / DLIN / DCSC</span>
              <span>COLUNAS 01-80 ESTACIONÁRIAS</span>
            </div>
            <div className="text-outline select-none">0001  TITU  ESTUDO PREVISTO CLIMAGRID 2025/05 REVISAO 02 - CORREDOR NE-BA-PI</div>
            <div className="text-on-surface"><span className="text-secondary font-semibold">0002  DBAR</span>  3412 CAETITE-BA      230.0 1 0 1.020   0.0   0.0   0.0     0.0     0.0</div>
            <div className="text-on-surface"><span className="text-secondary font-semibold">0003  DBAR</span>  3890 IRECE-BA        500.0 1 0 1.015   0.0   0.0   0.0     0.0     0.0</div>
            <div className="text-on-surface"><span className="text-secondary font-semibold">0004  DBAR</span>  4120 MCHAPEU-RN      230.0 1 0 1.000   0.0   0.0   0.0     0.0     0.0</div>
            <div className="text-on-surface"><span className="text-secondary font-semibold">0005  DGER</span>  3412 1 <span className="text-primary font-semibold">105.00</span> -75.00  180.00   0.00  1.020  <span className="text-tertiary">EOL-CA01</span> 1.00</div>
            <div className="text-on-surface"><span className="text-secondary font-semibold">0006  DGER</span>  3890 1 <span className="text-primary font-semibold">130.00</span> -90.00  220.00   0.00  1.015  <span className="text-tertiary">EOL-GB02</span> 1.00</div>
            <div className="text-on-surface"><span className="text-secondary font-semibold">0007  DGER</span>  4120 1 <span className="text-primary font-semibold">110.00</span> -40.00  150.00   0.00  1.000  <span className="text-tertiary">EOL-MR03</span> 1.00</div>
            <div className="text-on-surface"><span className="text-secondary font-semibold">0008  DLIN</span>  3412 3890 1    0.0125  0.0845  0.1200 450.0 450.0 520.0 1</div>
            <div className="text-outline select-none">0009  99999 FIM_DECK_ANAREDE_CLIMAGRID_EMISSAO_AUTOMATICA</div>
          </div>
          {/* Checksum & Regulatory Verification Footnote */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm font-data-mono-sm text-data-mono-sm text-on-surface-variant">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[16px] text-tertiary">lock</span>
              <span>SHA-256: 9b2d80d2449ca693e5068cf0cf5b29314aa78de71120058b8f2d5eeef17a</span>
            </div>
            <div className="flex items-center gap-space-xs text-outline">
              <span className="material-symbols-outlined text-[14px]">history</span>
              <span>Sincronizado há 38 segundos</span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
