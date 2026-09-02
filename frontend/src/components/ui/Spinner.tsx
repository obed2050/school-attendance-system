import { Loader2 } from "lucide-react";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

export function FullPageSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-[hsl(var(--muted))]">
        <Spinner className="h-8 w-8" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
