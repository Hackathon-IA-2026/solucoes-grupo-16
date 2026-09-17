import React from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { AppFooter } from './app-footer';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <div className="pl-64 flex flex-col min-h-screen">
        <Topbar />
        <main className="flex-1 pt-28 px-space-xl pb-space-xl w-full bg-surface flex flex-col">
          {children}
        </main>
        <AppFooter />
      </div>
    </>
  );
}
