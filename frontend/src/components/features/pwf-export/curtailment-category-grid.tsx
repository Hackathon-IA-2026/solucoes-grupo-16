import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export type CurtailmentCategory = {
  code: 'REL' | 'CNF' | 'ENE' | 'PAR';
  label: string;
  percentage: number;
  affectedPlants: number;
  powerAtRiskMw: number;
  tone: 'secondary' | 'primary' | 'tertiary' | 'error';
  icon: string;
  onsCode: string;
};

const categories: CurtailmentCategory[] = [
  {
    code: 'REL',
    label: 'Restrição Elétrica Sistêmica',
    percentage: 18.5,
    affectedPlants: 6,
    powerAtRiskMw: 280,
    tone: 'secondary',
    icon: 'bolt',
    onsCode: 'ONS 3.1'
  },
  {
    code: 'CNF',
    label: 'Congestionamento de Transmissão',
    percentage: 14.2,
    affectedPlants: 5,
    powerAtRiskMw: 215,
    tone: 'primary',
    icon: 'alt_route',
    onsCode: 'ONS 3.2'
  },
  {
    code: 'ENE',
    label: 'Excesso de Oferta / Inflexibilidade',
    percentage: 8.4,
    affectedPlants: 3,
    powerAtRiskMw: 120,
    tone: 'tertiary',
    icon: 'water_drop',
    onsCode: 'ONS 3.3'
  },
  {
    code: 'PAR',
    label: 'Parada Programada / Manutenção',
    percentage: 2.1,
    affectedPlants: 1,
    powerAtRiskMw: 30,
    tone: 'error',
    icon: 'construction',
    onsCode: 'ONS 3.4'
  }
];

export function CurtailmentCategoryCard({ category }: { category: CurtailmentCategory }) {
  const toneMap: Record<string, { bg: string; text: string }> = {
    secondary: { bg: 'bg-secondary', text: 'text-secondary' },
    primary: { bg: 'bg-primary', text: 'text-primary' },
    tertiary: { bg: 'bg-tertiary', text: 'text-tertiary' },
    error: { bg: 'bg-error', text: 'text-error' }
  };

  const toneClasses = toneMap[category.tone];

  return (
    <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between gap-space-md shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`px-space-sm py-[2px] rounded font-data-mono-sm text-data-mono-sm uppercase font-semibold bg-surface-container-highest ${toneClasses.text}`}>
          {category.code} • {category.onsCode}
        </span>
        <MaterialSymbol icon={category.icon} className="text-outline text-[20px]" />
      </div>
      <div className="flex flex-col gap-space-xs">
        <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">{category.label}</span>
        <div className="flex items-baseline gap-space-xs">
          <span className="font-headline-xl text-headline-xl text-on-surface font-bold">{category.percentage}%</span>
          <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">corte {category.code === 'PAR' ? 'programado' : 'previsto'}</span>
        </div>
      </div>
      <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
        <div className={`${toneClasses.bg} h-full rounded-full`} style={{ width: `${category.percentage}%` }}></div>
      </div>
      <div className="flex items-center justify-between font-data-mono-sm text-data-mono-sm text-on-surface-variant pt-space-xs">
        <span>{category.affectedPlants} usina{category.affectedPlants > 1 ? 's' : ''} {category.code === 'PAR' ? 'afetada' : 'impactadas'}</span>
        <span className="text-on-surface font-semibold">{category.powerAtRiskMw} MW {category.code === 'PAR' ? 'programados' : 'em risco'}</span>
      </div>
    </div>
  );
}

export function CurtailmentCategoryGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-lg">
      {categories.map((cat) => (
        <CurtailmentCategoryCard key={cat.code} category={cat} />
      ))}
    </div>
  );
}
