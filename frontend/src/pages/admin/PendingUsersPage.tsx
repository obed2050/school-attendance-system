import { useEffect, useState, useCallback } from "react";
import { Check, X, RefreshCw } from "lucide-react";
import { adminService } from "../../services";
import { getErrorMessage } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { EmptyState } from "../../components/ui/EmptyState";
import { User } from "../../types";

type BusyState = { id: number; action: "approve" | "reject" } | null;

export function PendingUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.pendingUsers();
      setUsers(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAction(action: "approve" | "reject", user: User) {
    setBusy({ id: user.id, action });
    setNotice(null);
    setError(null);
    try {
      if (action === "approve") {
        await adminService.approve(user.id);
      } else {
        await adminService.reject(user.id);
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setNotice(
        action === "approve"
          ? `Approved ${user.fullName}.`
          : `Rejected ${user.fullName}.`
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          Pending Staff
        </h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          Staff accounts awaiting your approval
        </p>
      </div>

      {notice && (
        <div className="mb-4">
          <Alert variant="success" message={notice} />
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert variant="error" message={error} />
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-[hsl(var(--muted))]">
          Loading pending requests...
        </p>
      ) : users.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No pending staff"
            description="There are no staff accounts waiting for approval."
            action={
              <Button variant="secondary" onClick={load} className="mt-2">
                <RefreshCw className="h-4 w-4" aria-hidden />
                Refresh
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-[hsl(var(--foreground))]">
                    {user.fullName}
                  </p>
                  <p className="mt-0.5 text-sm text-[hsl(var(--muted))]">
                    {user.email} · {user.phoneNumber}
                  </p>
                  <p className="text-sm text-[hsl(var(--muted))]">
                    {user.department.name} · Registered{" "}
                    {new Date(user.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric"
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    onClick={() => handleAction("approve", user)}
                    loading={busy?.id === user.id && busy.action === "approve"}
                    loadingText="Approving..."
                    className="flex-1 sm:flex-none"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleAction("reject", user)}
                    loading={busy?.id === user.id && busy.action === "reject"}
                    loadingText="Rejecting..."
                    className="flex-1 sm:flex-none"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
