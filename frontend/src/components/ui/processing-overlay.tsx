"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

interface ProcessingOverlayProps {
  open: boolean;
  title: string;
  message: string;
  steps?: string[];
  onDismiss?: () => void;
}

export function ProcessingOverlay({ open, title, message, steps = [], onDismiss }: ProcessingOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open || steps.length < 2) return;
    const timer = window.setInterval(() => setStepIndex((current) => current + 1), 4200);
    return () => window.clearInterval(timer);
  }, [open, steps.length]);

  if (!open) return null;
  const currentMessage = steps.length > 0 ? steps[stepIndex % steps.length] : message;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface/80 px-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="processing-title" aria-live="polite">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-secondary/25 bg-surface-container-low p-7 shadow-2xl shadow-black/50 sm:p-9">
        <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-surface-container-high">
          <span className="processing-progress block h-full w-1/3 bg-gradient-to-r from-primary-container via-secondary to-tertiary" />
        </div>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="absolute right-4 top-4 rounded-full p-2 text-outline transition hover:bg-surface-container-high hover:text-on-surface" aria-label="Fechar acompanhamento; o processo continuará">
            <Icon name="close" />
          </button>
        ) : null}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/10 text-secondary shadow-inner shadow-secondary/10">
          <Icon name="wind" className="h-8 w-8 animate-pulse" />
        </div>
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Processamento em andamento</p>
        <h2 id="processing-title" className="mt-2 text-2xl font-semibold tracking-tight text-on-surface">{title}</h2>
        <p className="mt-3 min-h-12 text-sm leading-6 text-on-surface-variant">{currentMessage || message}</p>
        <div className="mt-6 flex items-center gap-2 text-xs text-outline">
          <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" />
          Esta etapa pode levar alguns minutos. Você pode fechar este acompanhamento sem cancelar a operação.
        </div>
      </div>
    </div>
  );
}
