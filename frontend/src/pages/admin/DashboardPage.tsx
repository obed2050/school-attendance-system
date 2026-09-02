import { useEffect, useState, useCallback } from "react";
import {
  Users,
  CircleCheck,
  CircleX,
  Clock,
  CalendarDays
} from "lucide-react";
import { adminService } from "../../services";
import { getErrorMessage } from "../../services/api";
import { StatCard } from "../../components/ui/StatCard";
import { Alert } from "../../components/ui/Alert";
import { FullPageSpinner } from "../../components/ui/Spinner";
import { DashboardStats } from "../../types";

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [date, setDate] = useState<string>(todayKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selected: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.dashboardStats(selected);
      setStats(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Dashboard</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">
            Attendance statistics overview
          </p>
        </div>
        <label className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[hsl(var(--muted))]" aria-hidden />
          <input
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="input w-auto"
            aria-label="Select date"
          />
        </label>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error" message={error} />
        </div>
      )}

      {loading && !stats ? (
        <FullPageSpinner label="Loading statistics..." />
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Total Staff"
              value={stats.total_staff}
              icon={<Users className="h-5 w-5" aria-hidden />}
              accent="bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
            />
            <StatCard
              label="Present"
              value={stats.present}
              icon={<CircleCheck className="h-5 w-5" aria-hidden />}
              accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
            />
            <StatCard
              label="Absent"
              value={stats.absent}
              icon={<CircleX className="h-5 w-5" aria-hidden />}
              accent="bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300"
            />
            <StatCard
              label="Late"
              value={stats.late}
              icon={<Clock className="h-5 w-5" aria-hidden />}
              accent="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
            />
          </div>
          <p className="mt-4 text-sm text-[hsl(var(--muted))]">
            Statistics for{" "}
            <span className="font-medium text-[hsl(var(--foreground))]">
              {new Date(`${stats.date}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
              })}
            </span>
          </p>
        </>
      ) : null}
    </div>
  );
}
