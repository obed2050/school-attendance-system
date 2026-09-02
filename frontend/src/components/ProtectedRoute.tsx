import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FullPageSpinner } from "./ui/Spinner";
import { Role } from "../types";

export function ProtectedRoute({
  children,
  roles
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    const home = user.role === "ADMIN" ? "/dashboard" : "/attendance";
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
