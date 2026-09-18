'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { MaterialSymbol } from '@/components/ui/material-symbol';
import { MappingPageRibbon } from '@/components/features/bus-mapping/mapping-page-ribbon';
import { ScenarioManager } from '@/components/features/bus-mapping/scenario-manager';
import { MappingReadinessCard } from '@/components/features/bus-mapping/mapping-readiness-card';
import { BusMappingTable } from '@/components/features/bus-mapping/bus-mapping-table';
import { ElectricalSummaryGrid } from '@/components/features/bus-mapping/electrical-summary-grid';
import { Drawer } from '@/components/ui/drawer';

export default function MapeamentoBarrasPage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [isMatchComplete, setIsMatchComplete] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleAutoMatch = () => {
    setIsAutoMatching(true);
    setTimeout(() => {
      setIsAutoMatching(false);
      setIsMatchComplete(true);
      setTimeout(() => setIsMatchComplete(false), 3000);
    }, 1200);
  };

  const handleCopy = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <AppShell>
      <div className="flex flex-col w-full">
        {/* Dynamic Notification Bar / Context Ribbon */}
        <MappingPageRibbon 
          onOpenPreview={() => setIsDrawerOpen(true)}
          onAutoMatch={handleAutoMatch}
          isAutoMatching={isAutoMatching}
          isMatchComplete={isMatchComplete}
        />

        {/* Scenario Toolbar & Progress Rail */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg mb-space-lg">
          <ScenarioManager />
          <MappingReadinessCard />
        </div>

        {/* Primary Work Area: The "De-Para" Bus Association Table */}
        <BusMappingTable />

        {/* Bento Telemetry Strip & Electrical Statistics Footer */}
        <ElectricalSummaryGrid />
      </div>

      {/* Shadcn Style Slide-Over Drawer / Sheet for PWF Output Preview */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Sintaxe PWF: DBAR / DGER"
        subtitle="Deck formatado em colunas ANAREDE/CEPEL"
        icon="code"
        footer={
          <>
            <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
              <span className="w-2 h-2 rounded-full bg-tertiary"></span>
              <span>Checksum: 0x88F2B</span>
            </div>
            <div className="flex items-center gap-space-sm">
              <button 
                className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-space-xs transition-colors"
                onClick={handleCopy}
              >
                {isCopied ? (
                  <>
                    <MaterialSymbol icon="check" className="text-[16px] text-tertiary" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <MaterialSymbol icon="content_copy" className="text-[16px]" />
                    <span>Copiar Cartões</span>
                  </>
                )}
              </button>
              <button className="px-space-md py-space-xs rounded bg-primary-container hover:bg-inverse-primary text-on-primary-container font-label-md text-label-md transition-colors">
                Baixar .PWF
              </button>
            </div>
          </>
        }
      >
        <div className="p-space-sm rounded bg-surface-container-high/40 text-on-surface-variant mb-space-md">
          <p className="font-label-sm text-label-sm uppercase">Colunas Oficiais: NUM(1-5), OPER(6), EST(7), TIP(8), GRU(9-10), NOME(11-22), V(25-28), ANG(29-32), PG(33-37), QG(38-42)</p>
        </div>
        <pre className="text-tertiary select-all">{`TITU
ESTUDO ONS 2026/08 - CENARIO NOTURNO MAXIMO VENTO - EXP NE-SE
DBAR
(NUM)O E T GR (   NOME   )  V(KV)  ANG   PG(MW)  QG(MVAR) QM(MVAR)
 3412 D   0 32 MOSSORO IV   500.0  -2.1  180.00   12.40   50.00
 4520 D   0 44 MORRO CHAPEU 230.0  -4.5  120.50    5.10   35.00
 8910 D   0 44 JUAZEIRO III 500.0  -1.8  210.00   18.20   60.00
 6721 D   0 51 SAO JOAO PI  500.0  -3.2  475.00   32.00  120.00
 7823 D   0 32 CAMPINA GD   500.0  -0.9  135.00    9.50   40.00
99999
DGER
(NUM) (GL) (PMAX) (PMIN) (QMAX) (QMIN)
 3412    1 180.00   0.00  50.00 -30.00
 4520    1 120.50   0.00  35.00 -20.00
 8910    1 210.00   0.00  60.00 -40.00
 6721    1 475.00   0.00 120.00 -70.00
 7823    1 135.00   0.00  40.00 -25.00
99999
DINC
(DE ) (PARA) (NC) (XKM ) (RESIST) (REAC) (SUSCEP)
 3412  8910   1   142.5   0.0120  0.0890   0.1420
 4520  8910   1    98.2   0.0210  0.1140   0.0890
99999
FIM`}</pre>
      </Drawer>
    </AppShell>
  );
}
