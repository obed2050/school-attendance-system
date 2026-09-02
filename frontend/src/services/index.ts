import { api, API_BASE_URL } from "./api";
import { getToken } from "../utils/authStorage";
import {
  AuthResponse,
  DashboardStats,
  PaginatedResult,
  User,
  Department,
  MyAttendanceRecord,
  AdminAttendanceItem,
  AttendanceStatus,
  Role,
  UserStatus,
  FaceReferenceStatus,
  SchoolSettings
} from "../types";

export interface AdminAttendanceFilters {
  date?: string;
  department?: string | number;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminUserFilters {
  search?: string;
  role?: Role;
  status?: UserStatus;
  department?: string | number;
  page?: number;
  limit?: number;
}

export interface CreateUserPayload {
  full_name: string;
  email: string;
  phone_number: string;
  department_id: number;
  role: Role;
  password: string;
  confirm_password: string;
  status?: UserStatus;
}

export interface UpdateUserPayload {
  full_name?: string;
  email?: string;
  phone_number?: string;
  department_id?: number;
  role?: Role;
  status?: UserStatus;
}

export const authService = {
  async signup(payload: {
    full_name: string;
    email: string;
    phone_number: string;
    department_id: number;
    password: string;
    confirm_password: string;
  }): Promise<{ message: string }> {
    const res = await api.post("/auth/signup", payload);
    return res.data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await api.post("/auth/login", { email, password });
    return res.data.data;
  },

  async me(): Promise<User> {
    const res = await api.get("/auth/me");
    return res.data.data.user;
  },

  /** Enroll or re-enroll a staff member's reference face embedding. */
  async faceReference(
    embedding: number[],
    currentEmbedding?: number[]
  ): Promise<{ faceReferenceStatus: FaceReferenceStatus }> {
    const res = await api.put("/auth/face-reference", {
      embedding,
      current_embedding: currentEmbedding
    });
    return res.data.data;
  }
};

export const departmentService = {
  async list(): Promise<Department[]> {
    const res = await api.get("/departments");
    return res.data.data.departments;
  }
};

export interface AppConfig {
  schoolName: string;
  attendanceStartTime: string;
  lateAfterTime: string;
  timezone: string;
  serverTime: string;
}

export const configService = {
  async getAppConfig(): Promise<AppConfig> {
    const res = await api.get("/config");
    return res.data.data;
  }
};

export const attendanceService = {
  async submit(payload: {
    latitude: number;
    longitude: number;
    accuracy: number;
    embedding: number[];
    liveness: boolean;
  }): Promise<{
    id: number;
    status: AttendanceStatus;
    submitted: boolean;
    attendanceDate: string;
    checkInTime: string;
  }> {
    const res = await api.post("/attendance", payload);
    return res.data.data;
  },

  async myRecords(): Promise<MyAttendanceRecord[]> {
    const res = await api.get("/attendance/me");
    return res.data.data.records;
  },

  /** Provision (or reuse) this browser's device via an HttpOnly cookie. */
  async provisionDevice(): Promise<{
    status: "PENDING" | "ACTIVE" | "REVOKED";
    requiresVerification: boolean;
    deviceId: number;
  }> {
    const res = await api.post("/attendance/device");
    return res.data.data;
  }
};

export interface UpdateSettingsPayload {
  school_name?: string;
  latitude?: number;
  longitude?: number;
  geofence_radius?: number;
  attendance_start_time?: string;
  late_after_time?: string;
}

export const settingsService = {
  async getSettings(): Promise<SchoolSettings> {
    const res = await api.get("/admin/settings");
    return res.data.data.settings;
  },

  async updateSettings(payload: UpdateSettingsPayload): Promise<SchoolSettings> {
    const res = await api.put("/admin/settings", payload);
    return res.data.data.settings;
  }
};

export const adminService = {
  async departments(): Promise<Department[]> {
    const res = await api.get("/admin/departments");
    return res.data.data.departments;
  },

  async pendingUsers(): Promise<User[]> {
    const res = await api.get("/admin/pending-users");
    return res.data.data.users;
  },

  async approve(id: number): Promise<User> {
    const res = await api.patch(`/admin/users/${id}/approve`);
    return res.data.data.user;
  },

  async reject(id: number): Promise<User> {
    const res = await api.patch(`/admin/users/${id}/reject`);
    return res.data.data.user;
  },

  async users(filters: AdminUserFilters): Promise<PaginatedResult<User>> {
    const res = await api.get("/admin/users", { params: filters });
    return res.data.data;
  },

  async createUser(payload: CreateUserPayload): Promise<User> {
    const res = await api.post("/admin/users", payload);
    return res.data.data.user;
  },

  async updateUser(id: number, payload: UpdateUserPayload): Promise<User> {
    const res = await api.patch(`/admin/users/${id}`, payload);
    return res.data.data.user;
  },

  async resetPassword(id: number, password: string, confirmPassword: string): Promise<void> {
    await api.post(`/admin/users/${id}/reset-password`, {
      password,
      confirm_password: confirmPassword
    });
  },

  async attendance(
    filters: AdminAttendanceFilters
  ): Promise<PaginatedResult<AdminAttendanceItem>> {
    const res = await api.get("/admin/attendance", { params: filters });
    return res.data.data;
  },

  async attendanceExport(
    filters: AdminAttendanceFilters
  ): Promise<AdminAttendanceItem[]> {
    const { page: _page, limit: _limit, ...clean } = filters;
    void _page;
    void _limit;
    const res = await api.get("/admin/attendance/export", { params: clean });
    return res.data.data.records;
  },

  async dashboardStats(date?: string): Promise<DashboardStats> {
    const res = await api.get("/admin/dashboard/stats", { params: date ? { date } : {} });
    return res.data.data;
  },

  async exportPdf(filters: AdminAttendanceFilters): Promise<void> {
    await downloadExport("/admin/reports/attendance/pdf", filters, "attendance-report.pdf");
  },

  async exportExcel(filters: AdminAttendanceFilters): Promise<void> {
    await downloadExport(
      "/admin/reports/attendance/excel",
      filters,
      "attendance-report.xlsx"
    );
  }
};

async function downloadExport(
  url: string,
  params: AdminAttendanceFilters,
  fileName: string
): Promise<void> {
  const token = getToken();
  const searchParams = new URLSearchParams();
  if (params.date) searchParams.set("date", params.date);
  if (params.status) searchParams.set("status", params.status);
  if (params.search) searchParams.set("search", params.search);
  if (params.department !== undefined && params.department !== "") {
    searchParams.set("department", String(params.department));
  }
  const query = searchParams.toString();
  const requestUrl = `${API_BASE_URL}${url}${query ? `?${query}` : ""}`;

  const res = await fetch(requestUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!res.ok) {
    let message = "Export failed. Please try again.";
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}