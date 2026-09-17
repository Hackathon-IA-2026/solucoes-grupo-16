import React from 'react';

export interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  unit?: React.ReactNode;
  icon: string;
  iconColor?: 'primary' | 'secondary' | 'tertiary' | 'error' | 'outline';
  rightContent?: React.ReactNode;
}

export function MetricCard({
  title,
  value,
  unit,
  icon,
  iconColor = 'primary',
  rightContent
}: MetricCardProps) {
  return (
    <div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-lowest shadow-inner">
      <div className="flex items-center gap-space-md">
        <div className={`w-10 h-10 rounded-md bg-surface-container flex items-center justify-center text-${iconColor}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <div className="flex flex-col">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">{title}</span>
          <span className="font-data-mono-lg text-data-mono-lg text-on-surface font-bold">
            {value} {unit && <span className="text-body-sm text-outline font-normal">{unit}</span>}
          </span>
        </div>
      </div>
      {rightContent}
    </div>
  );
}
