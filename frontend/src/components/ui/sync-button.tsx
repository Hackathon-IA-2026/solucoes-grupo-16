import React from 'react';

export interface SyncButtonProps {
  lastSyncedLabel?: string;
  isSyncing?: boolean;
  onSync?: () => void;
}

export function SyncButton({ 
  lastSyncedLabel = "Sincronizado há 2m", 
  isSyncing = false, 
  onSync 
}: SyncButtonProps) {
  return (
    <button 
      onClick={onSync}
      disabled={isSyncing}
      className="hidden md:flex items-center gap-space-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high px-space-sm py-space-xs rounded transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Sincronizar dados"
    >
      <span className={`material-symbols-outlined text-[16px] text-tertiary ${isSyncing ? 'animate-spin' : ''}`}>
        sync
      </span>
      <span className="font-data-mono-sm text-data-mono-sm">{lastSyncedLabel}</span>
    </button>
  );
}
