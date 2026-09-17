import React from 'react';

export function AppFooter() {
  return (
    <footer className="w-full bg-surface-container-lowest px-space-xl py-space-md flex flex-col md:flex-row items-center justify-between gap-space-sm mt-auto">
      <div className="flex items-center gap-space-lg text-on-surface-variant">
        <span className="font-label-sm text-label-sm uppercase tracking-wider">Conformidade Regulatória: ONS / CCEE Módulo 26</span>
        <span className="font-label-sm text-label-sm text-outline">•</span>
        <span className="font-label-sm text-label-sm uppercase tracking-wider">Formatos PWF / ANAREDE Oficial</span>
      </div>
      <div className="flex items-center gap-space-sm">
        <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">ClimaGrid Engine Core v3.8.4</span>
        <span className="font-label-sm text-label-sm text-outline">|</span>
        <span className="font-data-mono-sm text-data-mono-sm text-secondary">2025 SIN Analytics Corp</span>
      </div>
    </footer>
  );
}
