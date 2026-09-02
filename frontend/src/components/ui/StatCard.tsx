import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: number;
  icon: ReactNode;
  accent?: string;
  hint?: string;
}

export function StatCard({
  label,
  value,
  icon,
  accent = "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  hint
}: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted))]">
            {label}
          </p>
          <p className="text-2xl font-bold leading-tight text-[hsl(var(--foreground))]">
            {value}
          </p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-[hsl(var(--muted))]">{hint}</p>}
    </div>
  );
}
