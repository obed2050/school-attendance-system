export type Role = "STAFF" | "ADMIN";
export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED";
export type AttendanceStatus = "PRESENT" | "LATE";
export type FaceReferenceStatus = "NOT_REGISTERED" | "REGISTERED";
export type DeviceRegistrationStatus = "NOT_REGISTERED" | "REGISTERED";

export interface Department {
  id: number;
  name: string;
}

export interface User {
  id: number;
  fullName: string;
  email: string;
  phoneNumber: string;
  departmentId: number;
  role: Role;
  status: UserStatus;
  faceReferenceStatus: FaceReferenceStatus;
  deviceRegistrationStatus: DeviceRegistrationStatus;
  createdAt: string;
  updatedAt: string;
  department: Department;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AttendanceSubmission {
  id: number;
  attendanceDate: string;
  checkInTime: string;
  status: AttendanceStatus;
  submitted: boolean;
}

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface SchoolSettings {
  id: number;
  schoolName: string;
  latitude: number;
  longitude: number;
  geofenceRadius: number;
  attendanceStartTime: string;
  lateAfterTime: string;
}

export interface MyAttendanceRecord {
  id: number;
  attendanceDate: string;
  checkInTime: string;
  status: AttendanceStatus;
  createdAt: string;
}

export interface AdminAttendanceItem {
  id: number;
  attendanceDate: string;
  checkInTime: string;
  status: AttendanceStatus;
  user: {
    fullName: string;
    email: string;
    phoneNumber: string;
    department: { name: string };
  };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  date: string;
  total_staff: number;
  present: number;
  late: number;
  absent: number;
}

export interface ApiErrorData {
  success: boolean;
  message: string;
  errors?: { field: string; message: string }[];
}
