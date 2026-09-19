import React from 'react';

export function AppFooter() {
  return (
    <footer className="mt-auto flex w-full flex-col gap-1 border-t border-outline-variant/40 bg-surface-container-lowest px-5 py-4 text-xs text-on-surface-variant sm:flex-row sm:items-center sm:justify-between lg:px-8">
      <span>ClimaGrid · MVP Hackathon IA COPPE 2026 · Equipe 16</span>
      <span>O cálculo de fluxo de potência permanece no ANAREDE.</span>
    </footer>
  );
}
