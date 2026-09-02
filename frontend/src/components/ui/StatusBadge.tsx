import {
  BadgeCheck,
  Clock,
  Ban,
  Hourglass,
  CircleCheck,
  CircleX,
  CircleAlert,
  Shield,
  UserRound
} from "lucide-react";

type Status =
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "PENDING"
  | "ACTIVE"
  | "REJECTED";

type Role = "STAFF" | "ADMIN";

const styles: Record<Status, { classes: string; icon: typeof Clock }> = {
  PRESENT: {
    classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    icon: BadgeCheck
  },
  LATE: {
    classes: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    icon: Clock
  },
  ABSENT: {
    classes: "bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300",
    icon: Ban
  },
  PENDING: {
    classes: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
    icon: Hourglass
  },
  ACTIVE: {
    classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    icon: CircleCheck
  },
  REJECTED: {
    classes: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
    icon: CircleX
  }
};

const roleStyles: Record<Role, { classes: string; icon: typeof Shield }> = {
  ADMIN: {
    classes:
      "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
    icon: Shield
  },
  STAFF: {
    classes: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
    icon: UserRound
  }
};

export function StatusBadge({ status }: { status: Status }) {
  const config = styles[status];
  const Icon = config.icon ?? CircleAlert;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.classes}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {status}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const config = roleStyles[role];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.classes}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {role}
    </span>
  );
}