import { useState, FormEvent, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { authService, departmentService } from "../services";
import { getErrorMessage } from "../services/api";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { Department } from "../types";

interface FormErrors {
  full_name?: string;
  email?: string;
  phone_number?: string;
  department_id?: string;
  password?: string;
  confirm_password?: string;
  general?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

export function SignupPage() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    department_id: "",
    password: "",
    confirm_password: ""
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    departmentService
      .list()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  function setField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (form.full_name.trim().length < 2) {
      next.full_name = "Please enter your full name.";
    }
    if (!form.email.trim()) {
      next.email = "Email is required.";
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      next.email = "Please enter a valid email address.";
    }
    if (!form.phone_number.trim()) {
      next.phone_number = "Phone number is required.";
    } else if (!PHONE_REGEX.test(form.phone_number.trim())) {
      next.phone_number = "Please enter a valid phone number.";
    }
    if (!form.department_id) {
      next.department_id = "Please select a department.";
    }
    if (form.password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }
    if (form.confirm_password !== form.password) {
      next.confirm_password = "Passwords do not match.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await authService.signup({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim(),
        department_id: Number(form.department_id),
        password: form.password,
        confirm_password: form.confirm_password
      });
      setSuccess(true);
    } catch (err) {
      setErrors({ general: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Alert
            variant="success"
            message="Account created successfully. Please wait for administrator approval."
          />
          <Button
            variant="secondary"
            className="mt-5 w-full"
            onClick={() => navigate("/login")}
          >
            Go to Login
          </Button>
          <p className="mt-4 text-sm text-[hsl(var(--muted))]">
            You can log in after an administrator approves your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center py-8 px-4">
      <div className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <GraduationCap className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Create account</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">
            Sign up to request staff access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          {errors.general && (
            <div className="mb-3">
              <Alert variant="error" message={errors.general} />
            </div>
          )}

          <Input
            label="Full Name"
            placeholder="Jane Smith"
            value={form.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
            error={errors.full_name}
            autoComplete="name"
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@school.com"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            error={errors.email}
            autoComplete="email"
          />
          <Input
            label="Phone Number"
            type="tel"
            placeholder="+1 234 567 890"
            value={form.phone_number}
            onChange={(e) => setField("phone_number", e.target.value)}
            error={errors.phone_number}
            autoComplete="tel"
          />
          <Select
            label="Department"
            placeholder="Select department"
            value={form.department_id}
            onChange={(e) => setField("department_id", e.target.value)}
            error={errors.department_id}
            disabled={departments.length === 0}
            options={departments.map((d) => ({
              value: d.id,
              label: d.name
            }))}
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min. 8 characters"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            error={errors.password}
            hint="Use at least 8 characters."
            autoComplete="new-password"
          />
          <Input
            label="Confirm Password"
            type="password"
            placeholder="Re-enter password"
            value={form.confirm_password}
            onChange={(e) => setField("confirm_password", e.target.value)}
            error={errors.confirm_password}
            autoComplete="new-password"
          />

          <Button
            type="submit"
            className="mt-2 w-full"
            loading={loading}
            loadingText="Creating account..."
          >
            Create Account
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-[hsl(var(--muted))]">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
