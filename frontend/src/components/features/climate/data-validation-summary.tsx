import React from 'react';
import { StatusBadge } from '@/components/ui/status-badge';

export function DataValidationSummary() {
  return (
    <div className="flex flex-col gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md h-full">
      <div className="flex items-center justify-between">
        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-error text-[20px]">fact_check</span>
          Diagnóstico de Integridade de Dados
        </span>
        <StatusBadge variant="error">2 Falhas de Consistência</StatusBadge>
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
  );
}
