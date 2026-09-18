import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';
import { MappingFilters } from './mapping-filters';

export type ValidationStatusType = 'validated' | 'pending' | 'alert';

export interface BusMappingPlant {
  id: string;
  name: string;
  onsId: string;
  uf: string;
  capacityMw: number;
  busNumber: string;
  busName: string;
  voltage: string;
  area: string;
  status: ValidationStatusType;
}

const mockMappings: BusMappingPlant[] = [
  {
    id: '1',
    name: 'EOL Ventos do Santo Agostinho I',
    onsId: 'ONS-EOL-RN-0981',
    uf: 'RN',
    capacityMw: 180.0,
    busNumber: '3412',
    busName: 'SE MOSSORO IV 500',
    voltage: '500',
    area: '32',
    status: 'validated',
  },
  {
    id: '2',
    name: 'UFV Morro do Chapéu Solar II',
    onsId: 'ONS-SOL-BA-4421',
    uf: 'BA',
    capacityMw: 120.5,
    busNumber: '4520',
    busName: 'SE MORRO CHAPEU 230',
    voltage: '230',
    area: '44',
    status: 'validated',
  },
  {
    id: '3',
    name: 'EOL Chapada do Piauí V',
    onsId: 'ONS-EOL-PI-1049',
    uf: 'PI',
    capacityMw: 95.4,
    busNumber: '',
    busName: '',
    voltage: '230',
    area: '51',
    status: 'pending',
  },
  {
    id: '4',
    name: 'EOL Serra da Babilônia III',
    onsId: 'ONS-EOL-BA-7742',
    uf: 'BA',
    capacityMw: 210.0,
    busNumber: '8910',
    busName: 'SE JUAZEIRO III 500',
    voltage: '138',
    area: '44',
    status: 'alert',
  },
  {
    id: '5',
    name: 'Complexo Solar São Gonçalo',
    onsId: 'ONS-SOL-PI-8891',
    uf: 'PI',
    capacityMw: 475.0,
    busNumber: '6721',
    busName: 'SE SAO JOAO PIAUI 500',
    voltage: '500',
    area: '51',
    status: 'validated',
  },
  {
    id: '6',
    name: 'EOL Coxigola Ventos da Paraíba',
    onsId: 'ONS-EOL-PB-0238',
    uf: 'PB',
    capacityMw: 135.0,
    busNumber: '7823',
    busName: 'SE CAMPINA GRANDE 500',
    voltage: '500',
    area: '32',
    status: 'validated',
  }
];

export function BusMappingRow({ plant, isAlternate }: { plant: BusMappingPlant; isAlternate: boolean }) {
  const bgClass = isAlternate ? 'bg-surface-container-low' : 'bg-surface-container';
  
  return (
    <tr className={`hover:bg-surface-container-high/60 transition-colors ${bgClass}`}>
      <td className="py-space-sm px-space-md">
        <div className="flex flex-col">
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{plant.name}</span>
          <div className="flex items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
            <span className="text-tertiary">{plant.onsId}</span>
            <span>•</span>
            <span>{plant.uf}</span>
            <span>•</span>
            <span className="text-primary font-medium">{plant.capacityMw} MW</span>
          </div>
        </div>
      </td>
      <td className="py-space-sm px-space-xs text-center">
        <MaterialSymbol icon="trending_flat" className={plant.status === 'pending' ? 'text-outline text-[18px]' : 'text-tertiary text-[18px]'} />
      </td>
      <td className="py-space-sm px-space-md">
        {plant.status === 'pending' ? (
          <div className="relative">
            <input className="w-24 bg-error-container/30 text-error font-data-mono-md text-data-mono-md px-space-sm py-1 rounded text-right focus:outline-none" placeholder="0000" type="number" defaultValue={plant.busNumber} />
          </div>
        ) : (
          <input className="w-24 bg-surface-container-lowest font-data-mono-md text-data-mono-md text-secondary px-space-sm py-1 rounded text-right focus:outline-none focus:bg-surface-container-high" type="number" defaultValue={plant.busNumber} />
        )}
      </td>
      <td className="py-space-sm px-space-md">
        {plant.status === 'pending' ? (
          <input className="w-full bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface-variant px-space-sm py-1 rounded uppercase focus:outline-none" placeholder="DEFINIR SUBESTAÇÃO..." type="text" defaultValue={plant.busName} />
        ) : (
          <input className="w-full bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded uppercase focus:outline-none focus:bg-surface-container-high" type="text" defaultValue={plant.busName} />
        )}
      </td>
      <td className="py-space-sm px-space-md">
        <select className={plant.status === 'alert' ? "bg-error-container/30 font-data-mono-sm text-data-mono-sm text-error px-space-sm py-1 rounded focus:outline-none font-medium" : "bg-surface-container-lowest font-data-mono-sm text-data-mono-sm text-on-surface px-space-sm py-1 rounded focus:outline-none"} defaultValue={plant.voltage}>
          <option value="500">500 kV</option>
          <option value="230">230 kV</option>
          <option value="138">138 kV</option>
        </select>
      </td>
      <td className="py-space-sm px-space-md">
        <select className="bg-surface-container-lowest font-body-sm text-body-sm text-on-surface px-space-sm py-1 rounded focus:outline-none w-full" defaultValue={plant.area}>
          <option value="32">Área 32 - RN/CE</option>
          <option value="44">Área 44 - Bahia Norte</option>
          <option value="51">Área 51 - Piauí Leste</option>
        </select>
      </td>
      <td className="py-space-sm px-space-md">
        {plant.status === 'validated' && (
          <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-primary/10 text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            Validada
          </span>
        )}
        {plant.status === 'pending' && (
          <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-error-container/40 text-on-error-container">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
            Pendente de Número
          </span>
        )}
        {plant.status === 'alert' && (
          <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-data-mono-sm text-data-mono-sm bg-tertiary-container/40 text-on-tertiary-container">
            <MaterialSymbol icon="sync_problem" className="text-[12px]" />
            Alerta: Tensão Incompatível
          </span>
        )}
      </td>
      <td className="py-space-sm px-space-md text-right">
        {plant.status === 'pending' ? (
          <button className="px-2 py-1 rounded bg-secondary-container/30 text-secondary hover:bg-secondary-container hover:text-on-secondary-container font-label-sm text-label-sm transition-all">
            Sugerir
          </button>
        ) : (
          <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface">
            <MaterialSymbol icon="more_vert" className="text-[16px]" />
          </button>
        )}
      </td>
    </tr>
  );
}

export function BusMappingTable() {
  return (
    <div className="w-full rounded-xl bg-surface-container shadow-md overflow-hidden mb-space-lg">
      <MappingFilters />
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
            {mockMappings.map((mapping, index) => (
              <BusMappingRow key={mapping.id} plant={mapping} isAlternate={index % 2 !== 0} />
            ))}
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
  );
}
