import { useState, FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../services/api";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to={user.role === "ADMIN" ? "/dashboard" : "/attendance"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      navigate(loggedUser.role === "ADMIN" ? "/dashboard" : "/attendance", {
        replace: true
      });
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <GraduationCap className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">School Attendance</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-1 p-6">
          {error && (
            <div className="mb-3">
              <Alert variant="error" message={error} />
            </div>
          )}

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@school.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" className="mt-2 w-full" loading={loading} loadingText="Signing in...">
            Login
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-[hsl(var(--muted))]">
          Don&apos;t have an account?{" "}
          <Link
            to="/signup"
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
