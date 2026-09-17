import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const workflowSteps = [
  { href: "/", label: "Entrada Climática", num: 1 },
  { href: "/usinas-estimativas", label: "Usinas & MW", num: 2 },
  { href: "/mapeamento-barras", label: "Mapeamento Barras", num: 3 },
  { href: "/exportacao-pwf", label: "Exportação PWF & Risco", num: 4 },
];

export function WorkflowStepper() {
  const pathname = usePathname();
  const currentStepIndex = workflowSteps.findIndex(step => 
    step.href === "/" ? pathname === "/" : pathname.startsWith(step.href)
  );

  return (
    <div className="h-12 px-space-xl bg-surface-container-low flex items-center">
      <nav className="flex items-center w-full justify-between gap-space-sm">
        {workflowSteps.map((step, index) => {
          const isActive = currentStepIndex !== -1 && index <= currentStepIndex;
          
          return (
            <React.Fragment key={step.href}>
              <Link 
                href={step.href} 
                className={`flex items-center gap-space-sm px-space-md py-space-xs rounded-lg transition-all ${
                  isActive 
                    ? 'bg-primary-container text-on-primary-container font-medium' 
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className={`w-5 h-5 rounded-full font-data-mono-sm text-data-mono-sm flex items-center justify-center ${
                  isActive 
                    ? 'bg-primary text-on-primary font-bold' 
                    : 'bg-surface-variant text-on-surface'
                }`}>
                  {step.num}
                </span>
                <span className="font-body-sm text-body-sm">{step.label}</span>
                {isActive && <span className="material-symbols-outlined text-[16px] text-tertiary">check_circle</span>}
              </Link>
              {index < workflowSteps.length - 1 && (
                <div className="flex-1 h-[1px] bg-surface-variant mx-space-xs"></div>
              )}
            </React.Fragment>
          );
        })}
      </nav>
    </div>
  );
}
