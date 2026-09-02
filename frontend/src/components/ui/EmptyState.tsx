import { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title = "No records found",
  description,
  action
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--surface-alt))] text-[hsl(var(--muted))]">
        <Inbox className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-[hsl(var(--foreground))]">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
