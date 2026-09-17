import React from 'react';

export interface TabsProps {
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ children, className = '' }: TabsProps) {
  return (
    <div className={`flex flex-col gap-space-xl ${className}`}>
      {children}
    </div>
  );
}

export interface TabsListProps {
  children: React.ReactNode;
}

export function TabsList({ children }: TabsListProps) {
  return (
    <div className="flex p-1 bg-surface-container-lowest rounded-lg w-fit shadow-inner self-start" role="tablist">
      {children}
    </div>
  );
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive: boolean;
  icon?: string;
}

export function TabsTrigger({ isActive, icon, children, ...props }: TabsTriggerProps) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={`flex items-center gap-space-sm px-space-lg py-space-sm rounded-md font-body-sm text-body-sm font-medium transition-all ${
        isActive
          ? 'bg-surface-container text-on-surface shadow-sm'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'
      }`}
      {...props}
    >
      {icon && <span className="material-symbols-outlined text-[18px] text-tertiary">{icon}</span>}
      {children}
    </button>
  );
}

export interface TabsContentProps {
  isActive: boolean;
  children: React.ReactNode;
}

export function TabsContent({ isActive, children }: TabsContentProps) {
  if (!isActive) return null;
  return (
    <div className="flex flex-col gap-space-xl animate-in fade-in duration-300">
      {children}
    </div>
  );
}
