import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import { FullPageSpinner } from "./components/ui/Spinner";

// The attendance + face pages pull in the TensorFlow.js / face-api weights,
// so they are loaded only when actually visited (per-route chunks).
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const SignupPage = lazy(() =>
  import("./pages/SignupPage").then((m) => ({ default: m.SignupPage }))
);
const PendingPage = lazy(() =>
  import("./pages/PendingPage").then((m) => ({ default: m.PendingPage }))
);
const AttendancePage = lazy(() =>
  import("./pages/AttendancePage").then((m) => ({ default: m.AttendancePage }))
);
const FaceSetupPage = lazy(() =>
  import("./pages/FaceSetupPage").then((m) => ({ default: m.FaceSetupPage }))
);
const DashboardPage = lazy(() =>
  import("./pages/admin/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const AdminAttendancePage = lazy(() =>
  import("./pages/admin/AttendancePage").then((m) => ({
    default: m.AdminAttendancePage
  }))
);
const PendingUsersPage = lazy(() =>
  import("./pages/admin/PendingUsersPage").then((m) => ({
    default: m.PendingUsersPage
  }))
);
const UsersPage = lazy(() =>
  import("./pages/admin/UsersPage").then((m) => ({ default: m.UsersPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/admin/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Navigate
      to={user.role === "ADMIN" ? "/dashboard" : "/attendance"}
      replace
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/pending" element={<PendingPage />} />

            <Route
              path="/attendance"
              element={
                <ProtectedRoute roles={["STAFF"]}>
                  <AttendancePage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/face-setup"
              element={
                <ProtectedRoute roles={["STAFF"]}>
                  <FaceSetupPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="attendance" element={<AdminAttendancePage />} />
              <Route path="pending-users" element={<PendingUsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}