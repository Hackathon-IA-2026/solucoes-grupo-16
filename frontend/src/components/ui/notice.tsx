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
    info: "border-accent-blue/25 bg-accent-blue/8 text-accent-blue",
    warning: "border-amber-300/25 bg-amber-300/8 text-yellow-500",
    success: "border-emerald-300/25 bg-emerald-300/8 text-paid",
    error: "border-overdue/25 bg-overdue/8 text-overdue",
  }[tone];

  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${styles}`} role="status">
      <Icon name={tone === "warning" || tone === "error" ? "alert" : tone === "success" ? "check" : "info"} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <div className="mt-1 text-sm leading-5 text-text-secondary">{children}</div>
      </div>
    </div>
  );
}
