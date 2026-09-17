import React from 'react';
import Link from 'next/link';

export function StageNav() {
  return (
    <div className="h-12 px-space-xl bg-surface-container-low flex items-center">
      <nav className="flex items-center w-full justify-between gap-space-sm" data-active-classes="bg-primary-container text-on-primary-container font-medium">
        <Link aria-current="page" href="#" className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg transition-all bg-primary-container text-on-primary-container font-medium" data-path="dados-climaticos">
          <span className="w-5 h-5 rounded-full bg-primary text-on-primary font-data-mono-sm text-data-mono-sm flex items-center justify-center font-bold">1</span>
          <span className="font-body-sm text-body-sm">Entrada Climática</span>
          <span className="material-symbols-outlined text-[16px] text-tertiary">check_circle</span>
        </Link>
        <div className="flex-1 h-[1px] bg-surface-variant mx-space-xs"></div>
        <Link href="#" className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="usinas-estimativas">
          <span className="w-5 h-5 rounded-full bg-surface-variant text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">2</span>
          <span className="font-body-sm text-body-sm">Usinas & MW</span>
        </Link>
        <div className="flex-1 h-[1px] bg-surface-variant mx-space-xs"></div>
        <Link href="#" className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="mapeamento-barras">
          <span className="w-5 h-5 rounded-full bg-surface-variant text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">3</span>
          <span className="font-body-sm text-body-sm">Mapeamento Barras</span>
        </Link>
        <div className="flex-1 h-[1px] bg-surface-variant mx-space-xs"></div>
        <Link href="#" className="flex items-center gap-space-sm px-space-md py-space-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="exportacao-pwf-curtailment">
          <span className="w-5 h-5 rounded-full bg-surface-variant text-on-surface font-data-mono-sm text-data-mono-sm flex items-center justify-center">4</span>
          <span className="font-body-sm text-body-sm">Exportação PWF & Risco</span>
        </Link>
      </nav>
    </div>
  );
}
