
import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  ScanFace,
  UserRound,
  ArrowLeft,
  CheckCircle2
} from "lucide-react";

import { authService, departmentService } from "../services";
import { getErrorMessage } from "../services/api";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { FaceCapture } from "../components/FaceCapture";
import type { LiveFaceResult } from "../utils/faceDetection";
import type { Department } from "../types";

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

type SignupStep = "details" | "face";

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
  const [step, setStep] = useState<SignupStep>("details");
  const [faceResult, setFaceResult] = useState<LiveFaceResult | null>(null);

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

  function handleContinue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!validate()) return;

    setErrors({});
    setStep("face");
  }

  function handleFaceCaptured(result: LiveFaceResult) {
    const validDescriptor =
      Array.isArray(result.descriptor) &&
      result.descriptor.length === 128 &&
      result.descriptor.every(
        (value) => Number.isFinite(value)
      );

    if (!result.livenessPassed || !validDescriptor) {
      setFaceResult(null);
      setErrors({
        general:
          "Face verification did not pass. Please try capturing your face again."
      });
      return;
    }

    setFaceResult(result);
    setErrors({});
  }

  async function handleSubmit() {
    if (loading) return;

    if (!validate()) {
      setStep("details");
      return;
    }

    if (
      !faceResult ||
      !faceResult.livenessPassed ||
      !Array.isArray(faceResult.descriptor) ||
      faceResult.descriptor.length !== 128 ||
      !faceResult.descriptor.every(
        (value) => Number.isFinite(value)
      )
    ) {
      setErrors({
        general:
          "Please complete the face and liveness check before creating your account."
      });
      setStep("face");
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      await authService.signup({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim(),
        department_id: Number(form.department_id),
        password: form.password,
        confirm_password: form.confirm_password,
        embedding: faceResult.descriptor,
        liveness: true
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
          <div className="mb-4 flex justify-center">
            <CheckCircle2 className="h-14 w-14 text-green-600" />
          </div>

          <Alert
            variant="success"
            message="Account created and face enrollment submitted successfully. Please wait for administrator approval."
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
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <GraduationCap className="h-7 w-7" aria-hidden />
          </div>

          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
            Create account
          </h1>

          <p className="mt-1 text-sm text-[hsl(var(--muted))]">
            Sign up to request staff access
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div
            className={`rounded-xl border p-3 ${
              step === "details"
                ? "border-brand-600 bg-brand-600/5"
                : "border-[hsl(var(--border))]"
            }`}
          >
            <div className="flex items-center gap-2">
              <UserRound className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">1. Details</span>
            </div>
            <p className="mt-1 text-xs text-[hsl(var(--muted))]">
              Your account information
            </p>
          </div>

          <div
            className={`rounded-xl border p-3 ${
              step === "face"
                ? "border-brand-600 bg-brand-600/5"
                : "border-[hsl(var(--border))]"
            }`}
          >
            <div className="flex items-center gap-2">
              <ScanFace className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">2. Face ID</span>
            </div>
            <p className="mt-1 text-xs text-[hsl(var(--muted))]">
              Face capture and liveness
            </p>
          </div>
        </div>

        <div className="card p-6">
          {errors.general && (
            <div className="mb-4">
              <Alert variant="error" message={errors.general} />
            </div>
          )}

          {step === "details" && (
            <form onSubmit={handleContinue} className="space-y-1">
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
                placeholder="+250 7XX XXX XXX"
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
                options={departments.map((department) => ({
                  value: department.id,
                  label: department.name
                }))}
              />

              {departments.length === 0 && (
                <p className="mb-3 text-xs text-amber-600">
                  Departments could not be loaded. Please refresh the page or
                  try again later.
                </p>
              )}

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
                onChange={(e) =>
                  setField("confirm_password", e.target.value)
                }
                error={errors.confirm_password}
                autoComplete="new-password"
              />

              <Button
                type="submit"
                className="mt-4 w-full"
                disabled={departments.length === 0}
              >
                Continue to Face Enrollment
              </Button>
            </form>
          )}

          {step === "face" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  Enroll your face
                </h2>
                <p className="mt-1 text-sm text-[hsl(var(--muted))]">
                  Allow camera access, look directly at the camera, and blink
                  when prompted. You must complete this check before your
                  account can be submitted.
                </p>
              </div>

              {faceResult ? (
                <div className="space-y-3">
                  <Alert
                    variant="success"
                    message="Face captured and liveness check passed. You can now submit your registration."
                  />

                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setFaceResult(null)}
                  >
                    Capture Face Again
                  </Button>
                </div>
              ) : (
                <FaceCapture
                  onSuccess={handleFaceCaptured}
                  minBlinks={2}
                  minTrackedMs={2000}
                  startLabel="Verify and capture face"
                  hint="Keep your face visible and follow the blinking instructions."
                />
              )}

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={!faceResult || loading}
                  loading={loading}
                  loadingText="Creating account..."
                >
                  Complete Registration
                </Button>

                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={loading}
                  onClick={() => {
                    setErrors({});
                    setStep("details");
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                  Back to Account Details
                </Button>
              </div>
            </div>
          )}
        </div>

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
