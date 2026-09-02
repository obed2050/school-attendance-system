import { ReactNode } from "react";
import { CircleCheck, CircleX, Info } from "lucide-react";

type Variant = "success" | "error" | "info";

const config: Record<Variant, { classes: string; icon: typeof Info }> = {
  success: {
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
    icon: CircleCheck
  },
  error: {
    classes: "bg-red-50 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30",
    icon: CircleX
  },
  info: {
    classes: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30",
    icon: Info
  }
};

interface AlertProps {
  variant?: Variant;
  message: string;
  children?: ReactNode;
}

export function Alert({ variant = "info", message, children }: AlertProps) {
  const c = config[variant];
  const Icon = c.icon;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${c.classes}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{message}</p>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  );
}
