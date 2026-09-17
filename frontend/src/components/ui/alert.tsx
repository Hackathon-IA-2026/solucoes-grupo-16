import React from 'react';

export interface AlertProps {
  variant?: 'info' | 'error' | 'warning' | 'success';
  title: string;
  children: React.ReactNode;
}

export function Alert({ variant = 'info', title, children }: AlertProps) {
  const isError = variant === 'error';
  const isWarning = variant === 'warning';
  const isSuccess = variant === 'success';

  let containerBg = 'bg-surface-container-highest';
  let iconColor = 'text-secondary';
  let icon = 'info';
  let titleColor = 'text-on-surface';

  if (isError) {
    containerBg = 'bg-error-container/20';
    iconColor = 'text-error';
    icon = 'warning';
    titleColor = 'text-on-surface';
  } else if (isWarning) {
    containerBg = 'bg-primary-container/20';
    iconColor = 'text-primary';
    icon = 'warning';
  } else if (isSuccess) {
    containerBg = 'bg-tertiary-container/20';
    iconColor = 'text-tertiary';
    icon = 'check_circle';
  }

  return (
    <div className={`flex gap-space-md p-space-lg rounded-lg ${containerBg} shadow-sm`} role="alert">
      <span className={`material-symbols-outlined ${iconColor} text-[22px] shrink-0 mt-0.5`}>{icon}</span>
      <div className="flex flex-col gap-space-xs">
        <span className={`font-body-md text-body-md ${titleColor} font-semibold`}>{title}</span>
        <div className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
