import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function CurtailmentAlert() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-space-lg shadow-md flex flex-col md:flex-row items-start gap-space-md">
      <div className="w-2 self-stretch bg-secondary rounded-full"></div>
      <div className="p-space-xs rounded-lg bg-surface-container-highest text-secondary flex items-center justify-center">
        <MaterialSymbol icon="warning" className="text-[24px]" />
      </div>
      <div className="flex-1 flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-sm flex-wrap">
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">ALERTA CNF (Confiabilidade de Rede): Risco de Contingência em Tronco Estrutural</span>
          <span className="bg-surface-container-lowest text-secondary font-data-mono-sm text-data-mono-sm px-space-sm py-space-xs rounded">Interligação BA-MG 500kV</span>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Risco potencial detectado em 5 usinas no tronco de 500kV Bahia-Minas. Pendente de validação no ANAREDE para verificação de sobrecarga em regime de contingência N-1 sob rajada eólica simultânea estimada em &gt; 11.8 m/s no corredor de Sobradinho/Juazeiro.
        </p>
      </div>
      <button className="bg-surface-container-lowest hover:bg-surface-container px-space-md py-space-sm rounded text-secondary font-body-sm text-body-sm font-medium transition-all flex items-center gap-space-xs whitespace-nowrap self-start md:self-center shadow-sm">
        <MaterialSymbol icon="tune" className="text-[16px]" />
        <span>Simular Despacho N-1</span>
      </button>
    </div>
  );
}
