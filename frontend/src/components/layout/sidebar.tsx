import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
// import { usePathname } from 'next/navigation';

const mainLinks = [
  { href: "/dados-climaticos", label: "Clima & Vento", icon: "air" },
  { href: "/usinas-estimativas", label: "Parque & Usinas", icon: "wind_power" },
  { href: "/mapeamento-barras", label: "Mapeamento Barras", icon: "hub" },
  { href: "/exportacao-pwf", label: "Exportação PWF", icon: "file_save" },
];

const secondaryLinks = [
  { href: "/telemetria", label: "Telemetria SIN", icon: "monitoring" },
  { href: "/historico", label: "Histórico & ONS", icon: "history" },
];

export function Sidebar() {
  // const pathname = usePathname();
  // using a hardcoded pathname for now until routing is fully set up
  const pathname = "/dados-climaticos";

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-low z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col">
        <div className="h-16 px-space-lg flex flex-col justify-center gap-1 bg-surface-container-lowest">
          <Image src="/logo.svg" alt="ClimaGrid Logo" width={170} height={35} />
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
            B2B Power Analytics
          </span>
        </div>
        
        <div className="px-space-md py-space-sm">
          <div className="px-space-sm py-space-xs font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
            Workspace
          </div>
        </div>

        <nav className="flex flex-col gap-space-xs px-space-md">
          {mainLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-space-md px-space-md py-space-sm transition-all rounded-lg ${
                  isActive 
                    ? 'bg-primary-container text-on-primary-container font-medium' 
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{link.icon}</span>
                <span className="font-body-md text-body-md">{link.label}</span>
              </Link>
            )
          })}
          
          <div className="my-space-sm h-px bg-surface-variant mx-space-md"></div>
          
          {secondaryLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-space-md px-space-md py-space-sm transition-all rounded-lg ${
                  isActive 
                    ? 'bg-primary-container text-on-primary-container font-medium' 
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{link.icon}</span>
                <span className="font-body-md text-body-md">{link.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="p-space-md bg-surface-container-lowest m-space-md rounded-lg flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
            Kernel ANAREDE
          </span>
          <span className="w-2 h-2 rounded-full bg-secondary"></span>
        </div>
        <span className="font-data-mono-sm text-data-mono-sm text-secondary">
          v05.24 COMPATÍVEL
        </span>
        <span className="font-label-sm text-label-sm text-outline">
          Deck ONS 2024/04 - Rev 2
        </span>
      </div>
    </aside>
  );
}
