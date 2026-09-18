import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function CurtailmentForecastChart() {
  return (
    <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col gap-space-md shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Perfil Horário de Despacho vs Cap</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">Trajetória D+1 (MW Médio por Hora)</span>
        </div>
        <MaterialSymbol icon="show_chart" className="text-secondary text-[20px]" />
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
  );
}
