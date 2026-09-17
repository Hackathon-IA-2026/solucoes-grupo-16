import React from 'react';

export function ClimateFileDropzone() {
  return (
    <div className="flex flex-col gap-space-md bg-surface-container-low p-space-xl rounded-xl shadow-md h-full">
      <div className="flex items-center justify-between">
        <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Upload de Dados Anemométricos</span>
        <span className="font-data-mono-sm text-data-mono-sm text-outline">Max 25MB por lote</span>
      </div>
      
      {/* Interactive Drag and Drop Zone */}
      <div className="flex flex-col items-center justify-center p-space-xl rounded-xl bg-surface-container-lowest hover:bg-surface-container-high/40 transition-all cursor-pointer group text-center gap-space-md shadow-inner">
        <div className="w-14 h-14 rounded-full bg-surface-container-high group-hover:scale-110 group-hover:bg-primary-container text-tertiary group-hover:text-on-primary-container transition-all flex items-center justify-center">
          <span className="material-symbols-outlined text-[28px]">upload_file</span>
        </div>
        <div className="flex flex-col gap-space-xs">
          <p className="font-body-md text-body-md text-on-surface font-medium">
            Arraste seu arquivo de medição ou <span className="text-primary underline">procure no disco</span>
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Compatível com séries temporais brutas em .CSV (separador ponto e vírgula ou vírgula) e .XLSX
          </p>
        </div>
        <div className="flex items-center gap-space-sm pt-space-xs">
          <span className="px-space-sm py-space-xs rounded bg-surface-container text-on-surface-variant font-data-mono-sm text-data-mono-sm">UTF-8 / ISO-8859-1</span>
          <span className="px-space-sm py-space-xs rounded bg-surface-container text-on-surface-variant font-data-mono-sm text-data-mono-sm">Torres & Lidar</span>
        </div>
      </div>
      
      {/* Pre-loaded File Pill */}
      <div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-highest shadow-sm">
        <div className="flex items-center gap-space-md">
          <span className="material-symbols-outlined text-secondary text-[24px]">description</span>
          <div className="flex flex-col">
            <span className="font-body-sm text-body-sm text-on-surface font-medium">cenario_nordeste_eolicas_agosto2026_rev4.csv</span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">14.8 MB • 350.400 registros detectados</span>
          </div>
        </div>
        <button className="w-8 h-8 rounded flex items-center justify-center hover:bg-surface-container text-on-surface-variant hover:text-error transition-colors">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      
      {/* Mandatory Columns Schema Chips */}
      <div className="flex flex-col gap-space-xs mt-auto pt-space-md">
        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Schema Exigido (Validação Estrita CCEE/ONS)</span>
        <div className="flex flex-wrap gap-space-xs">
          <span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">timestamp [ISO8601]</span>
          <span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">id_usina [VARCHAR]</span>
          <span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">vel_vento_ms [FLOAT]</span>
          <span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">dir_vento_deg [INT]</span>
          <span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">pressao_hpa [FLOAT]</span>
          <span className="px-space-sm py-space-xs rounded bg-surface-container-lowest text-tertiary font-data-mono-sm text-data-mono-sm">temp_c [FLOAT]</span>
        </div>
      </div>
    </div>
  );
}
