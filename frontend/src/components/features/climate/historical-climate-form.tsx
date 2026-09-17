"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';

const historicalSchema = z.object({
  subsystem: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

type HistoricalFormValues = z.infer<typeof historicalSchema>;

export function HistoricalClimateForm() {
  const { register, handleSubmit } = useForm<HistoricalFormValues>({
    resolver: zodResolver(historicalSchema),
    defaultValues: {
      subsystem: 'NE',
      startDate: '01/08/2026 00:00',
      endDate: '15/08/2026 23:00'
    }
  });

  const onSubmit = (data: HistoricalFormValues) => {
    console.log("Formulário de Histórico:", data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md h-full">
      <div className="flex items-center justify-between">
        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-secondary text-[20px]">tune</span>
          Parâmetros de Malha e Tempo
        </span>
        <span className="font-data-mono-sm text-data-mono-sm px-space-sm py-space-xs rounded bg-surface-container text-secondary font-medium">
          REDE BÁSICA 500/230kV
        </span>
      </div>

      <div className="flex flex-col gap-space-xs">
        <label className="font-label-md text-label-md text-on-surface-variant font-medium flex items-center justify-between">
          <span>Subsistema Elétrico Nacional</span>
          <span className="font-data-mono-sm text-data-mono-sm text-secondary">87% da capacidade eólica instalada no SIN</span>
        </label>
        <div className="relative">
          <select 
            {...register('subsystem')}
            className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg px-space-lg py-space-md appearance-none shadow-inner focus:outline-none focus:bg-surface-container-high transition-colors"
          >
            <option value="NE">Subsistema Nordeste (NE) — Cobertura Total Eólica</option>
            <option value="N">Subsistema Norte (N) — Integração Tucuruí / Belo Monte</option>
            <option value="SE_CO">Subsistema Sudeste / Centro-Oeste (SE/CO) — Carga Pesada</option>
            <option value="S">Subsistema Sul (S) — Complexos Eólicos Osório / Cerro Chato</option>
          </select>
          <span className="material-symbols-outlined absolute right-space-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[20px]">
            unfold_more
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-space-sm">
        <label className="font-label-md text-label-md text-on-surface-variant font-medium">Intervalo Temporal & Resolução</label>
        <div className="grid grid-cols-3 gap-space-sm">
          <button type="button" className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-body-sm font-body-sm transition-colors text-center">
            Últimas 24h
          </button>
          <button type="button" className="px-space-md py-space-xs rounded bg-primary-container text-on-primary-container text-body-sm font-body-sm font-medium transition-colors text-center shadow-sm">
            Semana Crítica (Ago/2026)
          </button>
          <button type="button" className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-body-sm font-body-sm transition-colors text-center">
            Personalizado
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md bg-surface-container-lowest p-space-md rounded-lg shadow-inner">
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">Início da Série</span>
            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-space-xs rounded text-on-surface font-data-mono-sm text-data-mono-sm">
              <span className="material-symbols-outlined text-[16px] text-tertiary">calendar_today</span>
              <span>01/08/2026 00:00</span>
            </div>
          </div>
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">Término da Série</span>
            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-space-xs rounded text-on-surface font-data-mono-sm text-data-mono-sm">
              <span className="material-symbols-outlined text-[16px] text-tertiary">event</span>
              <span>15/08/2026 23:00</span>
            </div>
          </div>
          <div className="flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">Resolução Temporal</span>
            <div className="flex items-center justify-between bg-surface-container px-space-sm py-space-xs rounded text-on-surface font-data-mono-sm text-data-mono-sm">
              <span>Passo 1h (360 pontos)</span>
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
            </div>
          </div>
        </div>
      </div>

      <Alert variant="info" title="Aviso de Corte de Dados Regulatórios">
        A base histórica <strong className="text-on-surface font-medium">ONS / ERA5</strong> com reanálise climática de alta resolução espacial (0.25° x 0.25°) está consolidada até <strong className="text-secondary font-medium">31/08/2026</strong>. Cenários posteriores utilizarão automaticamente a modelagem preditiva ensemble ClimaGrid AI.
      </Alert>
    </form>
  );
}
