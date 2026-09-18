'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { ComplianceSummary } from '@/components/features/pwf-export/compliance-summary';
import { CurtailmentAlert } from '@/components/features/pwf-export/curtailment-alert';
import { CurtailmentCategoryGrid } from '@/components/features/pwf-export/curtailment-category-grid';
import { SeverityMatrix } from '@/components/features/pwf-export/severity-matrix';
import { CurtailmentForecastChart } from '@/components/features/pwf-export/curtailment-forecast-chart';
import { DispatchRecommendations } from '@/components/features/pwf-export/dispatch-recommendations';
import { PwfExportPanel } from '@/components/features/pwf-export/pwf-export-panel';
import { SyntaxConsistencyLog } from '@/components/features/pwf-export/syntax-consistency-log';

export default function ExportacaoPwfCurtailmentPage() {
  const [isCompleteScenario, setIsCompleteScenario] = useState(true);

  const toggleValidationScenario = () => {
    setIsCompleteScenario(!isCompleteScenario);
  };

  const triggerPwfDownload = () => {
    if (!isCompleteScenario) {
      alert('Exportação Bloqueada: Conclua o mapeamento das usinas na Tela 3.');
      return;
    }
    const filename = 'CLIMAGRID_D+1_NE_202505_REV02.PWF';
    alert('Download iniciado: ' + filename + ' pronto para importação direta no ANAREDE / Organon.');
  };

  return (
    <AppShell>
      <div className="flex flex-col w-full gap-space-xl">
        {/* Top Operational Header with Compliance Status */}
        <ComplianceSummary />

        {/* Regulatory Highlight Alert: CNF Congestion Alert (Shadcn Alert styled) */}
        <CurtailmentAlert />

        {/* 4 Official ONS Curtailment Categories Dashboard */}
        <CurtailmentCategoryGrid />

        {/* Main Multi-pane Workbench: Severity Heatmap & Forecast Deck */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Plant Severity Matrix Table (8 cols) */}
          <SeverityMatrix />
          
          {/* Visual Analytics & Submarket Flow Chart Widget (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-space-lg">
            {/* Curtailment Horizon Time Series Card */}
            <CurtailmentForecastChart />
            
            {/* Live ONS Dispatch Recommendations Box */}
            <DispatchRecommendations />
          </div>
        </div>

        {/* Mandatory Feature 4: PWF File Exporter & State Validation UI Rule */}
        <PwfExportPanel 
          isCompleteScenario={isCompleteScenario}
          toggleValidationScenario={toggleValidationScenario}
          triggerPwfDownload={triggerPwfDownload}
        />

        {/* Mandatory Component 5: Live Syntactic Consistency Log Ready for ONS / CCEE Deck Submission */}
        <SyntaxConsistencyLog />
      </div>
    </AppShell>
  );
}
