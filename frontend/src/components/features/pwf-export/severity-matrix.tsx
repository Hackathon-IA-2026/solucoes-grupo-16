import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';
import { CurtailmentCategory } from './curtailment-category-grid';

export interface SeverityMatrixPlant {
  id: string;
  name: string;
  onsId: string;
  bus: string;
  voltage: string;
  forecastMw: number;
  curtailmentMw: number;
  curtailmentPercent: number;
  category: CurtailmentCategory['code'] | 'OK';
  action: string;
  actionIcon: string;
}

const mockSeverities: SeverityMatrixPlant[] = [
  {
    id: '1',
    name: 'Caetité Renováveis I',
    onsId: 'EOL-BA-CA01',
    bus: '#3412-CAET',
    voltage: '230 kV',
    forecastMw: 180,
    curtailmentMw: -75,
    curtailmentPercent: 41,
    category: 'REL',
    action: 'Limite de Injeção na Barra 3412',
    actionIcon: 'arrow_drop_down'
  },
  {
    id: '2',
    name: 'Gentio do Ouro Bio',
    onsId: 'EOL-BA-GB02',
    bus: '#3890-IREC',
    voltage: '500 kV',
    forecastMw: 220,
    curtailmentMw: -90,
    curtailmentPercent: 40,
    category: 'CNF',
    action: 'Redispatch Preventivo Interligação SE',
    actionIcon: 'swap_horiz'
  },
  {
    id: '3',
    name: 'Morro do Chapéu Sul',
    onsId: 'EOL-RN-MR03',
    bus: '#4120-MCHU',
    voltage: '230 kV',
    forecastMw: 150,
    curtailmentMw: -40,
    curtailmentPercent: 26,
    category: 'REL',
    action: 'Ajuste de Tap em Transformador T1',
    actionIcon: 'build_circle'
  },
  {
    id: '4',
    name: 'Lagoa dos Ventos II',
    onsId: 'EOL-PI-LC05',
    bus: '#5022-SJPI',
    voltage: '500 kV',
    forecastMw: 390,
    curtailmentMw: -60,
    curtailmentPercent: 15,
    category: 'ENE',
    action: 'Modulação em Rampa Hidráulica Sobradinho',
    actionIcon: 'schedule'
  },
  {
    id: '5',
    name: 'Asa Branca V',
    onsId: 'EOL-RN-AS08',
    bus: '#2210-JOAM',
    voltage: '138 kV',
    forecastMw: 90,
    curtailmentMw: -30,
    curtailmentPercent: 33,
    category: 'PAR',
    action: 'Manutenção em Bay de Saída (TA-04)',
    actionIcon: 'construction'
  },
  {
    id: '6',
    name: 'Serra da Babilônia III',
    onsId: 'EOL-BA-SM01',
    bus: '#3915-OURO',
    voltage: '230 kV',
    forecastMw: 110,
    curtailmentMw: 0,
    curtailmentPercent: 0,
    category: 'OK',
    action: 'Sem intervenção requerida',
    actionIcon: ''
  }
];

export function SeverityMatrixRow({ plant, isAlternate }: { plant: SeverityMatrixPlant; isAlternate: boolean }) {
  const bgClass = isAlternate ? 'bg-surface-container' : 'bg-surface-container-low';

  const categoryMap: Record<string, { bullet: string; text: string; bg: string; actionColor: string }> = {
    REL: { bullet: 'bg-secondary', text: 'text-secondary', bg: 'bg-surface-container-highest text-secondary', actionColor: 'text-secondary' },
    CNF: { bullet: 'bg-primary', text: 'text-primary', bg: 'bg-surface-container-highest text-primary', actionColor: 'text-primary' },
    ENE: { bullet: 'bg-tertiary', text: 'text-tertiary', bg: 'bg-surface-container-highest text-tertiary', actionColor: 'text-tertiary' },
    PAR: { bullet: 'bg-error', text: 'text-error', bg: 'bg-surface-container-highest text-error', actionColor: 'text-error' },
    OK: { bullet: 'bg-outline', text: 'text-on-surface-variant', bg: 'bg-surface-container-highest text-outline', actionColor: 'text-tertiary' }
  };

  const style = categoryMap[plant.category];

  return (
    <tr className={`hover:bg-surface-container transition-colors ${bgClass}`}>
      <td className="py-space-md px-space-lg font-medium text-on-surface flex items-center gap-space-sm">
        <span className={`w-2 h-2 rounded-full ${style.bullet}`}></span>
        <span className="truncate">[{plant.onsId}] {plant.name}</span>
      </td>
      <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">{plant.bus}</td>
      <td className="py-space-md px-space-md font-data-mono-md text-data-mono-md text-on-surface-variant">{plant.voltage}</td>
      <td className="py-space-md px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface">{plant.forecastMw} MW</td>
      <td className={`py-space-md px-space-md text-right font-data-mono-md text-data-mono-md ${plant.category === 'OK' ? 'text-on-surface-variant' : style.text} font-semibold`}>
        <div className="flex items-center justify-end gap-space-xs">
          <span>{plant.curtailmentMw} MW</span>
          <span className="font-label-sm text-label-sm text-outline">({plant.curtailmentPercent}%)</span>
        </div>
      </td>
      <td className="py-space-md px-space-md text-center">
        <span className={`px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm font-semibold ${style.bg}`}>
          {plant.category}
        </span>
      </td>
      <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface-variant">
        {plant.category === 'OK' ? (
          <span className={`${style.actionColor} font-medium`}>{plant.action}</span>
        ) : (
          <div className="flex items-center gap-space-xs">
            <MaterialSymbol icon={plant.actionIcon} className={`text-[14px] ${style.actionColor}`} />
            <span>{plant.action}</span>
          </div>
        )}
      </td>
    </tr>
  );
}

export function SeverityMatrix() {
  return (
    <div className="lg:col-span-8 flex flex-col bg-surface-container-low rounded-xl overflow-hidden shadow-md">
      <div className="p-space-lg bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-xs">
            <MaterialSymbol icon="reorder" className="text-primary text-[20px]" />
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Matriz de Severidade e Mitigação por Usina</span>
          </div>
          <span className="font-body-sm text-body-sm text-on-surface-variant">Análise de contingência horária (Janela Operativa D+1 14h00-18h00)</span>
        </div>
        <div className="flex items-center gap-space-sm">
          <div className="flex items-center gap-space-xs bg-surface-container-highest px-space-sm py-space-xs rounded">
            <MaterialSymbol icon="tune" className="text-[14px] text-tertiary" />
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
            {mockSeverities.map((plant, index) => (
              <SeverityMatrixRow key={plant.id} plant={plant} isAlternate={index % 2 !== 0} />
            ))}
          </tbody>
        </table>
      </div>
      {/* Quick Table Footer Stats */}
      <div className="p-space-md bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-space-sm font-data-mono-sm text-data-mono-sm text-on-surface-variant">
        <span>Corte Total Projetado no Bloco: <strong className="text-secondary">645 MW</strong> (26.3% da Capacidade Ativa)</span>
        <span>Algoritmo: Newton-Raphson com Limite de Q Automático</span>
      </div>
    </div>
  );
}
