import { Link } from "react-router-dom";
import { Hourglass, GraduationCap } from "lucide-react";
import { Button } from "../components/ui/Button";

export function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
          <Hourglass className="h-7 w-7" aria-hidden />
        </div>
        <div className="mb-3 flex justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </div>
        </div>
        <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">
          Account pending approval
        </h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted))]">
          Your account has been created and is waiting for an administrator to
          approve it. You will be able to sign in once your access is activated.
        </p>
        <Link to="/login" className="mt-5 block">
          <Button variant="secondary" className="w-full">
            Back to Login
          </Button>
        </Link>
      </div>
    </div>
  );
}
