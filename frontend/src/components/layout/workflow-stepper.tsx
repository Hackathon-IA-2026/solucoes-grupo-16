"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScenario } from "@/context/scenario-context";
import { workflowSteps } from "@/lib/workflow";

export function WorkflowStepper() {
  const pathname = usePathname();
  const { state } = useScenario();
  const currentStepIndex = workflowSteps.findIndex(step => 
    step.href === "/" ? pathname === "/" : pathname.startsWith(step.href)
  );
  const completed = [
    Boolean(state.climateScenario),
    state.selectedPlantIds.length > 0,
    state.selectedPlantIds.length > 0 && state.selectedPlantIds.every((id) => {
      const mapping = state.study.mappings[id];
      return Boolean(mapping?.busNumber && mapping.busName && mapping.nominalVoltageKv && mapping.area);
    }) && Boolean(state.study.referencePwf),
    false,
  ];

  return (
    <div className="overflow-x-auto bg-surface-container-low px-4 sm:px-6 lg:px-8">
      <nav className="mx-auto flex min-w-[620px] max-w-5xl items-center py-2" aria-label="Progresso do estudo">
        {workflowSteps.map((step, index) => {
          const isCurrent = index === currentStepIndex;
          
          return (
            <div key={step.href} className="flex flex-1 items-center last:flex-none">
              <Link 
                href={step.href} 
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                  isCurrent
                    ? "bg-primary-container text-on-primary-container font-semibold"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  isCurrent
                    ? "bg-white/15 text-white"
                    : completed[index]
                      ? "bg-emerald-300/15 text-emerald-200"
                      : "bg-surface-variant text-outline"
                }`}>
                  {completed[index] ? "✓" : index + 1}
                </span>
                <span className="whitespace-nowrap">{step.shortLabel}</span>
              </Link>
              {index < workflowSteps.length - 1 && (
                <div className={`mx-2 h-px flex-1 ${completed[index] ? "bg-emerald-300/40" : "bg-outline-variant"}`} />
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
