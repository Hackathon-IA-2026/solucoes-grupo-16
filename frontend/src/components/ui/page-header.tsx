export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, aside }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 rounded-2xl border border-neutral-900/50 bg-sidebar-bg p-5 shadow-card sm:p-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-4xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-blue">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary sm:text-base">{description}</p>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}
