import React from 'react';

export interface StatusBadgeProps {
  variant?: 'default' | 'error' | 'success' | 'warning' | 'info';
  children: React.ReactNode;
  icon?: string;
}

export function StatusBadge({ variant = 'default', children, icon }: StatusBadgeProps) {
  let colorClasses = 'bg-surface-container text-on-surface-variant';
  
  if (variant === 'error') {
    colorClasses = 'bg-error-container text-on-error-container';
  } else if (variant === 'success') {
    colorClasses = 'bg-tertiary-container/20 text-tertiary'; // Assuming tertiary is green-ish/success in this theme
  } else if (variant === 'warning') {
    colorClasses = 'bg-primary-container text-on-primary-container';
  } else if (variant === 'info') {
    colorClasses = 'bg-surface-container-low text-secondary';
  }

  return (
    <span className={`px-space-sm py-space-xs rounded ${colorClasses} font-label-sm text-label-sm font-semibold uppercase flex items-center gap-space-xs w-fit`}>
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
