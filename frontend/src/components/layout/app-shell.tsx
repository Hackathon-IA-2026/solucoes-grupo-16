import React from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { AppFooter } from './app-footer';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page-bg text-text-primary">
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar />
        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <div className="w-full">{children}</div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
