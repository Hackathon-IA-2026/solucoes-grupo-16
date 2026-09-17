import React from 'react';
import { MetricCard } from '@/components/ui/metric-card';

export function ClimateProfileSummary() {
  return (
    <div className="flex flex-col justify-between gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md h-full">
      <div className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Resumo do Perfil Climático</span>
          <span className="material-symbols-outlined text-tertiary text-[20px]">analytics</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Estimativas agregadas para os clusters eólicos do Subsistema Nordeste no horizonte selecionado.
        </p>
        
        <div className="grid grid-cols-1 gap-space-sm">
          <MetricCard 
            title="Velocidade Média Prevista"
            value="9.4"
            unit="m/s"
            icon="air"
            iconColor="secondary"
            rightContent={
              <span className="px-space-sm py-space-xs rounded bg-surface-container text-tertiary font-data-mono-sm text-data-mono-sm">+14% vs. Histórico</span>
            }
          />

          <MetricCard 
            title="Direção Predominante"
            value="ESE 112°"
            unit="(Alísios de SE)"
            icon="explore"
            iconColor="tertiary"
            rightContent={
              <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center">
                <span className="material-symbols-outlined text-[16px] text-tertiary transform rotate-[112deg]">navigation</span>
              </div>
            }
          />

          <MetricCard 
            title="Densidade Média do Ar (ρ)"
            value="1.18"
            unit="kg/m³"
            icon="thermostat"
            iconColor="primary"
            rightContent={
              <span className="font-data-mono-sm text-data-mono-sm text-outline">T_amb = 28.4°C</span>
            }
          />
        </div>
      </div>

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
  );
}
