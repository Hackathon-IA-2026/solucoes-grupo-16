import React from 'react';
import { MaterialSymbol } from '@/components/ui/material-symbol';

export function SyntaxConsistencyLog() {
  return (
    <div className="bg-surface-container-low p-space-xl rounded-xl flex flex-col gap-space-md shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <MaterialSymbol icon="code" className="text-secondary text-[20px]" />
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Log de Consistência Sintática e Prévia dos Cartões ANAREDE</h3>
        </div>
        <div className="flex items-center gap-space-sm font-data-mono-sm text-data-mono-sm text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-tertiary"></span>
          <span>Sintaxe Estrita ONS Módulo 26 Validada</span>
        </div>
      </div>
      {/* Raw Monospace Syntax Staging Area */}
      <div className="w-full bg-surface-container-lowest p-space-lg rounded-lg overflow-x-auto font-data-mono-sm text-data-mono-sm text-on-surface-variant flex flex-col gap-space-xs shadow-inner">
        <div className="flex items-center justify-between text-outline pb-space-xs">
          <span>CARTÃO: TITU / DBAR / DGER / DLIN / DCSC</span>
          <span>COLUNAS 01-80 ESTACIONÁRIAS</span>
        </div>
        <div className="text-outline select-none">0001  TITU  ESTUDO PREVISTO CLIMAGRID 2025/05 REVISAO 02 - CORREDOR NE-BA-PI</div>
        <div className="text-on-surface"><span className="text-secondary font-semibold">0002  DBAR</span>  3412 CAETITE-BA      230.0 1 0 1.020   0.0   0.0   0.0     0.0     0.0</div>
        <div className="text-on-surface"><span className="text-secondary font-semibold">0003  DBAR</span>  3890 IRECE-BA        500.0 1 0 1.015   0.0   0.0   0.0     0.0     0.0</div>
        <div className="text-on-surface"><span className="text-secondary font-semibold">0004  DBAR</span>  4120 MCHAPEU-RN      230.0 1 0 1.000   0.0   0.0   0.0     0.0     0.0</div>
        <div className="text-outline select-none">0005  ... [19 BARRAS SUPRIMIDAS]</div>
        <div className="text-on-surface"><span className="text-primary font-semibold">0025  DGER</span>  3412   1 180.00   0.00  50.00 -30.00  100.0   0.00  100.00  100.00</div>
        <div className="text-on-surface"><span className="text-primary font-semibold">0026  DGER</span>  3890   1 220.00   0.00  60.00 -40.00  100.0   0.00  100.00  100.00</div>
        <div className="text-on-surface"><span className="text-primary font-semibold">0027  DGER</span>  4120   1 150.00   0.00  45.00 -25.00  100.0   0.00  100.00  100.00</div>
        <div className="text-outline select-none">0028  ... [19 GERADORES SUPRIMIDOS]</div>
        <div className="text-on-surface"><span className="text-tertiary font-semibold">0048  DINC</span>  3412  3890   1   142.5   0.0120  0.0890   0.1420</div>
        <div className="text-on-surface"><span className="text-tertiary font-semibold">0049  DINC</span>  4120  3890   1    98.2   0.0210  0.1140   0.0890</div>
        <div className="text-outline select-none">0050  ... [RAMOS DE INTERLIGAÇÃO SUPRIMIDOS]</div>
        <div className="text-outline select-none">0180  FIM</div>
      </div>
    </div>
  );
}
