export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, aside }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 rounded-2xl border border-outline-variant/50 bg-surface-container-low p-5 shadow-sm sm:p-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-4xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-secondary">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant sm:text-base">{description}</p>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}
