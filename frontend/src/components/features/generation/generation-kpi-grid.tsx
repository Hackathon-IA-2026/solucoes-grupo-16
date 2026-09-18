import React from 'react';

interface GenerationKpiCardProps {
  title: string;
  icon: string;
  value: string;
  unit: string;
  subtitle: string;
  subvalue: string;
  colorClass: string;
}

export function GenerationKpiCard({
  title,
  icon,
  value,
  unit,
  subtitle,
  subvalue,
  colorClass,
}: GenerationKpiCardProps) {
  // mapping colorClass (e.g., 'primary', 'secondary') to specific Tailwind utility classes
  // The original used specific hex or bg colors like bg-primary/5 etc.
  const colorMap: Record<string, { bgBlur: string; text: string; subvalueText?: string; subvalueBg?: string }> = {
    primary: {
      bgBlur: 'bg-primary/5 group-hover:bg-primary/10',
      text: 'text-primary',
      subvalueText: 'text-primary'
    },
    secondary: {
      bgBlur: 'bg-secondary/5 group-hover:bg-secondary/10',
      text: 'text-secondary',
      subvalueText: 'text-secondary'
    },
    tertiary: {
      bgBlur: 'bg-tertiary/5 group-hover:bg-tertiary/10',
      text: 'text-tertiary',
      subvalueText: 'text-tertiary',
      subvalueBg: 'bg-tertiary-container/30'
    },
    amber: {
      bgBlur: 'bg-amber-500/5 group-hover:bg-amber-500/10',
      text: 'text-amber-400',
      subvalueText: 'text-amber-300'
    }
  };

  const colors = colorMap[colorClass] || colorMap.primary;

  return (
    <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group">
      <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-xl transition-all ${colors.bgBlur}`}></div>
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">{title}</span>
        <span className={`material-symbols-outlined text-[20px] ${colors.text}`}>{icon}</span>
      </div>
      <div className="mt-space-md flex items-baseline gap-space-xs">
        <span className={`font-headline-xl text-headline-xl font-data-mono-lg ${colorClass === 'tertiary' || colorClass === 'amber' ? colors.text : 'text-on-surface'}`}>
          {value}
        </span>
        <span className="font-label-md text-label-md text-on-surface-variant">{unit}</span>
      </div>
      <div className="mt-space-xs flex items-center justify-between text-on-surface-variant">
        <span className="font-body-sm text-body-sm">{subtitle}</span>
        <span className={`${colors.subvalueBg ? `px-space-xs py-0.5 rounded ${colors.subvalueBg} font-semibold ` : ''}font-data-mono-sm text-data-mono-sm ${colors.subvalueText}`}>
          {subvalue}
        </span>
      </div>
    </div>
  );
}

export function GenerationKpiGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
      <GenerationKpiCard
        title="Usinas Filtradas"
        icon="wind_power"
        value="24"
        unit="usinas"
        subtitle="Subsistema NE Ativo"
        subvalue="100% elegíveis"
        colorClass="primary"
      />
      <GenerationKpiCard
        title="Capacidade Instalada"
        icon="offline_bolt"
        value="2.840,5"
        unit="MW"
        subtitle="Potência Nominal Total"
        subvalue="1.142 aerogeradores"
        colorClass="secondary"
      />
      <GenerationKpiCard
        title="Geração Estimada Média"
        icon="speed"
        value="2.195,2"
        unit="MW"
        subtitle="Fator de Capacidade Médio"
        subvalue="77.3%"
        colorClass="tertiary"
      />
      <GenerationKpiCard
        title="Risco Prévio de Curtailment"
        icon="warning"
        value="38%"
        unit="(9 usinas)"
        subtitle="Gargalo Elétrico ONS"
        subvalue="Nível Crítico"
        colorClass="amber"
      />
    </div>
  );
}
