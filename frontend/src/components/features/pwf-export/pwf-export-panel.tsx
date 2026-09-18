import React, { useState } from 'react';
import Link from 'next/link';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function PwfExportPanel({ 
  isCompleteScenario, 
  toggleValidationScenario, 
  triggerPwfDownload 
}: { 
  isCompleteScenario: boolean; 
  toggleValidationScenario: () => void; 
  triggerPwfDownload: () => void; 
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="bg-surface-container-low p-space-xl rounded-xl flex flex-col gap-space-lg shadow-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <MaterialSymbol icon="terminal" className="text-primary text-[24px]" />
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
            <MaterialSymbol icon="sync_alt" className="text-[16px]" />
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
                <MaterialSymbol icon="error" className="text-[24px]" />
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
                    <MaterialSymbol icon="arrow_back" className="text-[16px]" />
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
                <MaterialSymbol icon="check_circle" className="text-[24px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Integridade Topológica: 100% das Usinas Mapeadas (24/24)</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Todos os cartões DBAR, DGER e DLIN validados contra o Deck Oficial ONS 2025/04. Nenhuma inconsistência nodal detectada.</span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-xs rounded font-data-mono-sm text-data-mono-sm text-tertiary">
              <MaterialSymbol icon="fingerprint" className="text-[16px]" />
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
              <MaterialSymbol icon="download_for_offline" className="text-[22px]" />
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
            <MaterialSymbol icon="picture_as_pdf" className="text-[18px] text-on-surface-variant" />
            <span>Exportar Relatório Executivo de Risco (PDF)</span>
          </button>
          <button className="flex-1 md:flex-none px-space-md py-space-sm bg-surface-container hover:bg-surface-container-highest text-on-surface font-body-sm text-body-sm font-medium rounded-lg transition-all flex items-center justify-center gap-space-xs shadow-sm">
            <MaterialSymbol icon="table_view" className="text-[18px] text-on-surface-variant" />
            <span>Baixar Dados Tabulares (CSV)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
