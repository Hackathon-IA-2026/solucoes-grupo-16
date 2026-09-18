import React from 'react';

interface ProgressBarProps {
  value: number; // 0 to 100
  colorClass?: string;
  className?: string;
}

export function ProgressBar({ value, colorClass = 'bg-primary', className = '' }: ProgressBarProps) {
  return (
    <div className={`w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden ${className}`}>
      <div 
        className={`${colorClass} h-full rounded-full transition-all duration-500`} 
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }} 
      />
    </div>
  );
}
