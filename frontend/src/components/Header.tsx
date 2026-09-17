import React from 'react';
import { StageNav } from './StageNav';

export function Header() {
  return (
    <header className="fixed top-0 left-64 right-0 h-28 bg-surface/90 backdrop-blur-xl z-40 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-16 px-space-xl flex items-center justify-between">
        <div className="flex items-center gap-space-lg">
          <div className="flex items-center gap-space-sm bg-surface-container-high px-space-md py-space-xs rounded-lg">
            <span className="material-symbols-outlined text-secondary text-[18px]">share_location</span>
            <span className="font-body-sm text-body-sm text-on-surface font-medium">SIN - Subsistema Nordeste ativo</span>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px]">expand_more</span>
          </div>
          <div className="hidden xl:flex items-center gap-space-xs bg-surface-container-low px-space-md py-space-xs rounded-lg">
            <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-surface">IA Modelo v4.2 • ONS Base Conectada</span>
          </div>
          <div className="hidden md:flex items-center gap-space-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] text-tertiary">sync</span>
            <span className="font-data-mono-sm text-data-mono-sm">Sincronizado há 2m</span>
          </div>
        </div>
        <div className="flex items-center gap-space-lg">
          <div className="hidden lg:flex flex-col items-end text-right">
            <span className="font-body-sm text-body-sm text-on-surface font-medium">Eng. Carlos Meireles</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Planejamento Energético</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </div>
      <StageNav />
    </header>
  );
}
