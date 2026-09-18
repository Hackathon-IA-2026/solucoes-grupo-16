import React from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  icon?: string;
}

export function Drawer({ isOpen, onClose, title, subtitle, children, footer, icon = 'code' }: DrawerProps) {
  return (
    <aside 
      className={`fixed top-0 right-0 h-full w-full sm:w-[540px] bg-surface-container-lowest z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col justify-between ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-16 px-space-lg bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-secondary text-[22px]">{icon}</span>
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{title}</span>
            {subtitle && <span className="font-label-sm text-label-sm text-on-surface-variant">{subtitle}</span>}
          </div>
        </div>
        <button 
          className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          onClick={onClose}
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div className="flex-1 p-space-lg overflow-y-auto font-data-mono-sm text-data-mono-sm bg-surface-container-lowest text-secondary-fixed-dim leading-relaxed">
        {children}
      </div>
      {footer && (
        <div className="p-space-md bg-surface-container-low flex items-center justify-between gap-space-sm">
          {footer}
        </div>
      )}
    </aside>
  );
}
