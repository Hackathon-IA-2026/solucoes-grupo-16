import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export type GenerationConfidence = 'high' | 'excellent' | 'medium';
export type HistoricRisk = 'freq_rel' | 'ocasional_cnf' | 'baixo_ene' | 'sem_historico';

export interface GenerationPlant {
  id: string;
  onsId: string;
  name: string;
  substation: string;
  uf: string;
  capacityMw: number;
  coordinates: string;
  forecastMw: number;
  capacityFactorPercent: number; // For the mini progress bar
  availabilityPercent: number; // Historical availability
  confidenceLevel: GenerationConfidence;
  confidencePercent: number;
  historicRisk: HistoricRisk;
}

const mockPlants: GenerationPlant[] = [
  {
    id: '1',
    onsId: 'EOL-BA-CH01',
    name: 'Complexo Chapada Diamante I',
    substation: 'Subestação SE Gentio do Ouro 230kV',
    uf: 'BA',
    capacityMw: 180.0,
    coordinates: '-11.552°, -41.285°',
    forecastMw: 158.4,
    capacityFactorPercent: 88,
    availabilityPercent: 98.4,
    confidenceLevel: 'high',
    confidencePercent: 96,
    historicRisk: 'freq_rel'
  },
  {
    id: '2',
    onsId: 'EOL-BA-MC02',
    name: 'Eólica Morro do Chapéu Sul',
    substation: 'Subestação SE Ourolândia II 500kV',
    uf: 'BA',
    capacityMw: 220.0,
    coordinates: '-11.230°, -41.110°',
    forecastMw: 189.2,
    capacityFactorPercent: 86,
    availabilityPercent: 96.1,
    confidenceLevel: 'high',
    confidencePercent: 94,
    historicRisk: 'ocasional_cnf'
  },
  {
    id: '3',
    onsId: 'EOL-PI-LG02',
    name: 'Complexo Ventos de Santa Joana',
    substation: 'Subestação SE Curral Novo 500kV',
    uf: 'PI',
    capacityMw: 300.0,
    coordinates: '-08.810°, -40.890°',
    forecastMw: 246.0,
    capacityFactorPercent: 82,
    availabilityPercent: 99.1,
    confidenceLevel: 'excellent',
    confidencePercent: 98,
    historicRisk: 'baixo_ene'
  },
  {
    id: '4',
    onsId: 'EOL-PI-DP03',
    name: 'Delta do Parnaíba III',
    substation: 'Subestação SE Ilha Grande 230kV',
    uf: 'PI',
    capacityMw: 90.0,
    coordinates: '-02.910°, -41.760°',
    forecastMw: 71.5,
    capacityFactorPercent: 79,
    availabilityPercent: 91.5,
    confidenceLevel: 'medium',
    confidencePercent: 82,
    historicRisk: 'sem_historico'
  }
];

export function ConfidenceBadge({ level, percent }: { level: GenerationConfidence; percent: number }) {
  if (level === 'excellent') {
    return (
      <span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm font-semibold bg-sky-500/10 text-sky-400">
        Excelente ({percent}%)
      </span>
    );
  }
  if (level === 'high') {
    return (
      <span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm font-semibold bg-emerald-500/10 text-emerald-400">
        Alto ({percent}%)
      </span>
    );
  }
  return (
    <span className="px-space-sm py-0.5 rounded text-label-sm font-label-sm font-semibold bg-amber-500/10 text-amber-300">
      Médio ({percent}%)
    </span>
  );
}

export function RiskBadge({ risk }: { risk: HistoricRisk }) {
  const map: Record<HistoricRisk, { label: string; classes: string }> = {
    freq_rel: { label: 'Freq. REL', classes: 'bg-amber-500/15 text-amber-300' },
    ocasional_cnf: { label: 'Ocasional CNF', classes: 'bg-indigo-500/15 text-indigo-300' },
    baixo_ene: { label: 'Baixo ENE', classes: 'bg-emerald-500/15 text-emerald-300' },
    sem_historico: { label: 'Sem histórico', classes: 'bg-surface-container-highest text-on-surface-variant' }
  };
  
  const { label, classes } = map[risk];
  
  return (
    <span className={`px-space-xs py-0.5 rounded text-label-sm font-label-sm font-data-mono-sm uppercase tracking-wide ${classes}`}>
      {label}
    </span>
  );
}

export function GenerationTableRow({ plant, isAlternate }: { plant: GenerationPlant; isAlternate: boolean }) {
  const bgClass = isAlternate ? 'bg-surface-container-high/20' : 'bg-surface-container-low';
  
  // Format numbers to pt-BR
  const capacityFormatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(plant.capacityMw);
  const forecastFormatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(plant.forecastMw);
  const availabilityFormatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(plant.availabilityPercent);

  // Availability color logic based on original design
  const availabilityColor = plant.availabilityPercent > 95 ? 'bg-emerald-400' : 'bg-amber-400';
  const availabilityTextColor = plant.availabilityPercent > 95 ? 'text-emerald-400' : 'text-amber-400';

  return (
    <tr className={`${bgClass} hover:bg-surface-container-high/60 transition-colors duration-150 group`}>
      <td className="py-space-sm px-space-md text-center">
        <input defaultChecked className="row-checkbox w-4 h-4 rounded bg-surface-container-high accent-primary cursor-pointer" type="checkbox"/>
      </td>
      <td className="py-space-sm px-space-md font-data-mono-sm text-data-mono-sm text-secondary font-medium whitespace-nowrap">
        {plant.onsId}
      </td>
      <td className="py-space-sm px-space-md font-medium">
        <div className="flex flex-col">
          <span className="text-on-surface font-medium hover:text-primary transition-colors cursor-pointer">{plant.name}</span>
          <span className="text-on-surface-variant font-label-sm text-label-sm">{plant.substation}</span>
        </div>
      </td>
      <td className="py-space-sm px-space-md text-center">
        <span className="px-space-xs py-0.5 rounded text-label-sm font-label-sm font-semibold bg-surface-container-highest text-on-surface">{plant.uf}</span>
      </td>
      <td className="py-space-sm px-space-md text-right font-data-mono-md text-data-mono-md text-on-surface whitespace-nowrap">
        {capacityFormatted} <span className="text-on-surface-variant font-label-sm text-label-sm">MW</span>
      </td>
      <td className="py-space-sm px-space-md text-center">
        <a className="font-data-mono-sm text-data-mono-sm text-on-surface-variant hover:text-tertiary inline-flex items-center gap-0.5 transition-colors" href="#">
          <span>{plant.coordinates}</span>
          <MaterialSymbol icon="open_in_new" className="text-[14px]" />
        </a>
      </td>
      <td className="py-space-sm px-space-md text-right whitespace-nowrap">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-baseline gap-1">
            <span className="font-data-mono-lg text-data-mono-lg font-bold text-tertiary">{forecastFormatted}</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">MW</span>
          </div>
          <div className="w-24 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="bg-tertiary h-full rounded-full" style={{ width: `${plant.capacityFactorPercent}%` }}></div>
          </div>
        </div>
      </td>
      <td className="py-space-sm px-space-md text-center">
        <div className="inline-flex items-center gap-space-xs">
          <div className="w-12 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div className={`${availabilityColor} h-full rounded-full`} style={{ width: `${plant.availabilityPercent}%` }}></div>
          </div>
          <span className={`font-data-mono-sm text-data-mono-sm ${availabilityTextColor} font-medium`}>{availabilityFormatted}%</span>
        </div>
      </td>
      <td className="py-space-sm px-space-md text-center">
        <ConfidenceBadge level={plant.confidenceLevel} percent={plant.confidencePercent} />
      </td>
      <td className="py-space-sm px-space-md text-center">
        <RiskBadge risk={plant.historicRisk} />
      </td>
      <td className="py-space-sm px-space-md text-center">
        <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-all">
          <MaterialSymbol icon="more_vert" className="text-[18px]" />
        </button>
      </td>
    </tr>
  );
}

export function GenerationTable() {
  return (
    <div className="bg-surface-container-low rounded-xl shadow-sm overflow-hidden flex flex-col" id="table-container">
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
            {mockPlants.map((plant, index) => (
              <GenerationTableRow key={plant.id} plant={plant} isAlternate={index % 2 !== 0} />
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Table Pagination & Selection Summary Bar */}
      <div className="bg-surface-container-lowest px-space-lg py-space-md flex flex-col md:flex-row items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Mostrando <span className="font-semibold text-on-surface">1-4</span> de <span className="font-semibold text-on-surface">24</span> usinas
          </span>
          <span className="hidden sm:inline text-outline">•</span>
          <span className="font-data-mono-sm text-data-mono-sm text-tertiary" id="selection-counter">
            4 de 4 selecionadas na página (24 total no deck)
          </span>
        </div>
        <div className="flex items-center gap-space-sm">
          <button className="px-space-sm py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant disabled:opacity-40 disabled:cursor-not-allowed font-label-md text-label-md flex items-center gap-1" disabled={true}>
            <MaterialSymbol icon="chevron_left" className="text-[16px]" />
            <span>Anterior</span>
          </button>
          <div className="flex items-center gap-1">
            <button className="w-7 h-7 rounded bg-primary text-on-primary font-data-mono-sm text-data-mono-sm font-semibold flex items-center justify-center">1</button>
            <button className="w-7 h-7 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">2</button>
            <button className="w-7 h-7 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">3</button>
          </div>
          <button className="px-space-sm py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md flex items-center gap-1">
            <span>Próxima</span>
            <MaterialSymbol icon="chevron_right" className="text-[16px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
