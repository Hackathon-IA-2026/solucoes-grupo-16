import React from 'react';

export interface PageHeaderProps {
  stepName: string;
  contextTag: string;
  title: string;
  description: string;
  telemetryMetrics?: {
    label: string;
    value: string;
    color?: string; // 'secondary', 'tertiary', etc.
  }[];
}

export function PageHeader({ stepName, contextTag, title, description, telemetryMetrics }: PageHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg bg-surface-container-low p-space-xl rounded-xl shadow-md">
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-sm">
          <span className="px-space-sm py-space-xs rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm uppercase tracking-wider font-semibold">
            {stepName}
          </span>
          <span className="font-label-sm text-label-sm text-outline">•</span>
          <span className="font-data-mono-sm text-data-mono-sm text-tertiary">{contextTag}</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
          {title}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          {description}
        </p>
      </div>

      {telemetryMetrics && telemetryMetrics.length > 0 && (
        <div className="flex items-center gap-space-md self-start lg:self-center bg-surface-container-high px-space-lg py-space-sm rounded-lg shadow-sm">
          {telemetryMetrics.map((metric, index) => (
            <React.Fragment key={metric.label}>
              <div className="flex flex-col items-start">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">{metric.label}</span>
                <span className={`font-data-mono-md text-data-mono-md text-${metric.color || 'on-surface'} font-medium`}>
                  {metric.value}
                </span>
              </div>
              {index < telemetryMetrics.length - 1 && (
                <div className="w-px h-8 bg-surface-variant"></div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
