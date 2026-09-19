import { Icon } from "@/components/ui/icon";

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "success" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-secondary/25 bg-secondary/8 text-secondary",
    warning: "border-amber-300/25 bg-amber-300/8 text-amber-200",
    success: "border-emerald-300/25 bg-emerald-300/8 text-emerald-200",
    error: "border-error/25 bg-error/8 text-error",
  }[tone];

  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${styles}`} role="status">
      <Icon name={tone === "warning" || tone === "error" ? "alert" : tone === "success" ? "check" : "info"} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-on-surface">{title}</p>
        <div className="mt-1 text-sm leading-5 text-on-surface-variant">{children}</div>
      </div>
    </div>
  );
}
