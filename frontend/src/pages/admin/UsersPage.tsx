import { useCallback, useEffect, useState } from "react";
import {
  Search,
  UserPlus,
  Pencil,
  KeyRound,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { adminService } from "../../services";
import { getErrorMessage } from "../../services/api";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { RoleBadge } from "../../components/ui/StatusBadge";
import { Alert } from "../../components/ui/Alert";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Role, User, UserStatus } from "../../types";
import { AddUserModal } from "../../components/admin/AddUserModal";
import { EditUserModal } from "../../components/admin/EditUserModal";
import { ResetPasswordModal } from "../../components/admin/ResetPasswordModal";

const PAGE_SIZE = 10;

type NoticeState = { kind: "success" | "error"; message: string } | null;
type BusyState = { id: number; action: "approve" | "reject" } | null;

export function UsersPage() {
  const [departments, setDepartments] = useState<
    { id: number; name: string }[]
  >([]);
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState<BusyState>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);

  useEffect(() => {
    adminService
      .departments()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, role, status, department]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.users({
        search: debouncedSearch || undefined,
        role: (role || undefined) as Role | undefined,
        status: (status || undefined) as UserStatus | undefined,
        department: department ? Number(department) : undefined,
        page,
        limit: PAGE_SIZE
      });
      setUsers(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, role, status, department, page]);

  useEffect(() => {
    load();
  }, [load]);

  function clearFilters() {
    setSearch("");
    setRole("");
    setStatus("");
    setDepartment("");
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  async function handleApproveReject(action: "approve" | "reject", user: User) {
    setBusy({ id: user.id, action });
    setNotice(null);
    setError(null);
    try {
      if (action === "approve") {
        await adminService.approve(user.id);
        setNotice({ kind: "success", message: `${user.fullName} was approved.` });
      } else {
        await adminService.reject(user.id);
        setNotice({ kind: "success", message: `${user.fullName} was rejected.` });
      }
      load();
    } catch (err) {
      setNotice({ kind: "error", message: getErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const hasActiveFilters = Boolean(
    debouncedSearch || role || status || department
  );

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Users</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">
            Manage all staff and administrator accounts
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="sm:flex-none">
          <UserPlus className="h-4 w-4" aria-hidden />
          Add User
        </Button>
      </div>

      <div className="card mb-4 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]"
              aria-hidden
            />
            <input
              className="input pl-9"
              placeholder="Search name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users"
            />
          </div>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
          </select>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <select
            className="input"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilters && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm font-medium text-[hsl(var(--muted))] transition-colors hover:bg-[hsl(var(--surface-alt))] hover:text-[hsl(var(--foreground))]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="mb-4">
          <Alert variant={notice.kind} message={notice.message} />
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert variant="error" message={error} />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-alt))] text-xs uppercase tracking-wide text-[hsl(var(--muted))]">
                <th className="px-4 py-3 font-semibold">Full Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-[hsl(var(--border))] last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))]">
                    {user.fullName}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {user.phoneNumber}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {user.department.name}
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {user.status === "PENDING" && user.role === "STAFF" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApproveReject("approve", user)}
                            disabled={
                              busy?.id === user.id && busy.action === "approve"
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 transition-colors hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25"
                            aria-label={`Approve ${user.fullName}`}
                            title="Approve"
                          >
                            <Check className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveReject("reject", user)}
                            disabled={
                              busy?.id === user.id && busy.action === "reject"
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
                            aria-label={`Reject ${user.fullName}`}
                            title="Reject"
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingUser(user)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 transition-colors hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:hover:bg-sky-500/25"
                        aria-label={`Edit ${user.fullName}`}
                        title="Edit user"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setResettingUser(user)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:hover:bg-slate-500/30"
                        aria-label={`Reset password for ${user.fullName}`}
                        title="Reset password"
                      >
                        <KeyRound className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <p className="px-4 py-6 text-center text-sm text-[hsl(var(--muted))]">
            Loading users...
          </p>
        )}
        {!loading && users.length === 0 && (
          <EmptyState
            title="No users found"
            description="Try adjusting your search or filters."
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-[hsl(var(--muted))]">
        <p>
          Page {page} of {Math.max(totalPages, 1)} · {total} records
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--surface-alt))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--surface-alt))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <AddUserModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        departments={departments}
        onCreated={(result) => {
          setNotice({ kind: "success", message: result.createdAtNotice });
          load();
        }}
      />
      <EditUserModal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        departments={departments}
        onUpdated={() => {
          setNotice({ kind: "success", message: "User updated successfully." });
          load();
        }}
      />
      <ResetPasswordModal
        open={!!resettingUser}
        onClose={() => setResettingUser(null)}
        user={resettingUser}
        onReset={() => {
          setNotice({ kind: "success", message: "Password reset successfully." });
        }}
      />
    </div>
  );
}