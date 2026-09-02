import { useCallback, useEffect, useState } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Printer,
  RefreshCw
} from "lucide-react";
import { adminService, configService } from "../../services";
import { AppConfig } from "../../services";
import { getErrorMessage } from "../../services/api";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Alert } from "../../components/ui/Alert";
import { EmptyState } from "../../components/ui/EmptyState";
import { Department, AdminAttendanceItem } from "../../types";

const PAGE_SIZE = 10;

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildFilterSummary(
  date: string,
  department: string,
  status: string,
  departments: Department[],
  search: string
): string {
  const parts: string[] = [];
  if (date) parts.push(`Date: ${date}`);
  if (department) {
    const found = departments.find((d) => String(d.id) === department);
    if (found) parts.push(`Department: ${found.name}`);
  }
  if (status) parts.push(`Status: ${status}`);
  if (search.trim()) parts.push(`Search: "${search.trim()}"`);
  return parts.length > 0 ? parts.join("   |   ") : "All records";
}

export function AdminAttendancePage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schoolName, setSchoolName] = useState("School Attendance");
  const [records, setRecords] = useState<AdminAttendanceItem[]>([]);
  const [printRecords, setPrintRecords] = useState<AdminAttendanceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [date, setDate] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    adminService
      .departments()
      .then(setDepartments)
      .catch(() => setDepartments([]));
    configService
      .getAppConfig()
      .then((config: AppConfig) => setSchoolName(config.schoolName))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, date, department, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.attendance({
        search: debouncedSearch || undefined,
        date: date || undefined,
        department: department ? Number(department) : undefined,
        status: status || undefined,
        page,
        limit: PAGE_SIZE
      });
      setRecords(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, date, department, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  function clearFilters() {
    setSearch("");
    setDate("");
    setDepartment("");
    setStatus("");
  }

  async function handleExport(kind: "pdf" | "excel") {
    setExporting(kind);
    setExportError(null);
    const filters = {
      search: debouncedSearch || undefined,
      date: date || undefined,
      department: department ? Number(department) : undefined,
      status: status || undefined
    };
    try {
      if (kind === "pdf") {
        await adminService.exportPdf(filters);
      } else {
        await adminService.exportExcel(filters);
      }
    } catch (err) {
      setExportError(getErrorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  function handlePrint() {
    const print = async () => {
      setExporting("pdf");
      setExportError(null);
      try {
        const all = await adminService.attendanceExport({
          search: debouncedSearch || undefined,
          date: date || undefined,
          department: department ? Number(department) : undefined,
          status: status || undefined
        });
        setPrintRecords(all);
        setTimeout(() => window.print(), 50);
      } catch (err) {
        setExportError(getErrorMessage(err));
      } finally {
        setExporting(null);
      }
    };
    print();
  }

  const hasActiveFilters = Boolean(debouncedSearch || date || department || status);
  const filterSummary = buildFilterSummary(
    date,
    department,
    status,
    departments,
    debouncedSearch
  );
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  return (
    <div>
      <div className="no-print mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Attendance</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">
            Recorded attendance across all staff
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
          >
            {exporting === "pdf" ? "Generating..." : "PDF"}
            <FileText className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => handleExport("excel")}
            disabled={exporting !== null}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
          >
            {exporting === "excel" ? "Generating..." : "EXCEL"}
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--surface-alt))]"
          >
            Print
            <Printer className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {exportError && (
        <div className="mb-4">
          <Alert variant="error" message={exportError} />
        </div>
      )}

      <div className="no-print card mb-4 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]"
              aria-hidden
            />
            <input
              className="input pl-9"
              placeholder="Search name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search attendance"
            />
          </div>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Filter by date"
          />
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
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="PRESENT">Present</option>
            <option value="LATE">Late</option>
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

      {error && (
        <div className="mb-4 no-print">
          <Alert variant="error" message={error} />
        </div>
      )}

      <div className="no-print card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-alt))] text-xs uppercase tracking-wide text-[hsl(var(--muted))]">
                <th className="px-4 py-3 font-semibold">Full Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Check-in</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-[hsl(var(--border))] last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))]">
                    {record.user.fullName}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {record.user.email}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {record.user.phoneNumber}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {record.user.department.name}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {formatDateLabel(record.attendanceDate)}
                  </td>
                  <td className="px-4 py-3 text-[hsl(var(--muted))]">
                    {formatTimeLabel(record.checkInTime)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={record.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <p className="px-4 py-6 text-center text-sm text-[hsl(var(--muted))]">
            Loading records...
          </p>
        )}
        {!loading && records.length === 0 && (
          <EmptyState
            title="No attendance records"
            description="Try adjusting your search or filters."
          />
        )}
      </div>

      <div className="no-print mt-4 flex items-center justify-between text-sm text-[hsl(var(--muted))]">
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

      {/* Printable report - hidden on screen, rendered for print */}
      <div className="print-area hidden print:block" aria-hidden>
        <div className="text-center">
          <h1 className="text-xl font-bold" style={{ color: "#000" }}>
            {schoolName}
          </h1>
          <h2 className="mt-1 text-base font-semibold" style={{ color: "#000" }}>
            Attendance Report
          </h2>
        </div>
        <p className="mt-3 text-xs" style={{ color: "#111" }}>
          Filters: {filterSummary}
        </p>
        <p className="text-xs" style={{ color: "#111" }}>
          Generated: {generatedAt}
        </p>
        <table
          className="mt-4 w-full"
          style={{ borderCollapse: "collapse", color: "#000" }}
        >
          <thead>
            <tr>
              {[
                "Full Name",
                "Email",
                "Phone",
                "Department",
                "Date",
                "Check-in",
                "Status"
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="border px-2 py-2 text-left text-xs font-semibold"
                  style={{ background: "#eef2ff", color: "#000" }}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printRecords.map((record) => (
              <tr key={record.id}>
                <td className="border px-2 py-1.5 text-left text-xs">
                  {record.user.fullName}
                </td>
                <td className="border px-2 py-1.5 text-left text-xs">
                  {record.user.email}
                </td>
                <td className="border px-2 py-1.5 text-left text-xs">
                  {record.user.phoneNumber}
                </td>
                <td className="border px-2 py-1.5 text-left text-xs">
                  {record.user.department.name}
                </td>
                <td className="border px-2 py-1.5 text-left text-xs">
                  {formatDateLabel(record.attendanceDate)}
                </td>
                <td className="border px-2 py-1.5 text-left text-xs">
                  {formatTimeLabel(record.checkInTime)}
                </td>
                <td className="border px-2 py-1.5 text-left text-xs">
                  {record.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs" style={{ color: "#111" }}>
          Total records shown: {printRecords.length}
        </p>
      </div>
    </div>
  );
}