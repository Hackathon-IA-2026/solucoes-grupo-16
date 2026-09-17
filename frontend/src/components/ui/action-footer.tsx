import React from 'react';
import Link from 'next/link';

export interface ActionFooterProps {
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  secondaryActionIcon?: string;
  
  primaryActionLabel: string;
  primaryActionIcon?: string;
  primaryActionHref?: string;
  onPrimaryAction?: () => void;
}

export function ActionFooter({
  onSecondaryAction,
  secondaryActionLabel,
  secondaryActionIcon,
  primaryActionLabel,
  primaryActionIcon = 'arrow_forward',
  primaryActionHref,
  onPrimaryAction
}: ActionFooterProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-md">
      {secondaryActionLabel ? (
        <button 
          onClick={onSecondaryAction}
          className="w-full sm:w-auto px-space-xl py-space-md rounded-lg bg-surface-container-high hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium transition-colors shadow-sm flex items-center justify-center gap-space-sm"
        >
          {secondaryActionIcon && <span className="material-symbols-outlined text-[18px]">{secondaryActionIcon}</span>}
          {secondaryActionLabel}
        </button>
      ) : <div />}

      <div className="flex items-center gap-space-md w-full sm:w-auto">
        {primaryActionHref ? (
          <Link
            href={primaryActionHref}
            className="w-full sm:w-auto px-space-xl py-space-md rounded-lg bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-body-sm text-body-sm font-semibold transition-all shadow-md flex items-center justify-center gap-space-sm"
          >
            <span>{primaryActionLabel}</span>
            {primaryActionIcon && <span className="material-symbols-outlined text-[18px]">{primaryActionIcon}</span>}
          </Link>
        ) : (
          <button
            onClick={onPrimaryAction}
            className="w-full sm:w-auto px-space-xl py-space-md rounded-lg bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-body-sm text-body-sm font-semibold transition-all shadow-md flex items-center justify-center gap-space-sm"
          >
            <span>{primaryActionLabel}</span>
            {primaryActionIcon && <span className="material-symbols-outlined text-[18px]">{primaryActionIcon}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
