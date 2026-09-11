import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap,
  LogOut,
  MapPin,
  Phone,
  Mail,
  QrCode,
  LogIn,
  Camera,
  CircleCheck,
  CircleAlert,
  TriangleAlert,
  Check,
  RefreshCw
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { attendanceService, configService, authService, AppConfig } from "../services";
import { getErrorMessage } from "../services/api";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { StatusBadge } from "../components/ui/StatusBadge";
import { FaceCapture } from "../components/FaceCapture";
import { ThemeToggle } from "../components/ThemeToggle";
import { LiveFaceResult } from "../utils/faceDetection";
import { LocationFix, AttendanceStatus, User } from "../types";

interface SubmittedInfo {
  date: string;
  time: string;
  status: AttendanceStatus;
}

interface LocationStatus {
  kind: "verified" | "warning" | "failed" | "unable";
  title: string;
  message: string;
  accuracy: number;
}

const LOW_ACCURACY_THRESHOLD_METERS = 50;

const steps = [
  { label: "QR", icon: QrCode },
  { label: "Login", icon: LogIn },
  { label: "Location", icon: MapPin },
  { label: "Liveness", icon: Camera },
  { label: "Done", icon: CircleCheck }
];

function schoolDateKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function formatDateTime(d: Date) {
  return d.toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "Please allow location access to continue.";
    case 2:
      return "Your location could not be verified. Please move to an open area and try again.";
    case 3:
      return "Location detection timed out. Please try again.";
    default:
      return "Your location could not be verified. Please try again.";
  }
}

export function AttendancePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [entryLoading, setEntryLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(2);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locationFix, setLocationFix] = useState<LocationFix | null>(null);
  const [faceResult, setFaceResult] = useState<{
    embedding: number[];
    liveness: boolean;
  } | null>(null);
  const [captureId, setCaptureId] = useState(0);
  const [freshUser, setFreshUser] = useState<User | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedInfo | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const cfg = await configService.getAppConfig();
        if (!active) return;
        setConfig(cfg);
        const todayKey = schoolDateKey(cfg.serverTime, cfg.timezone);
        try {
          const records = await attendanceService.myRecords();
          if (!active) return;
          const existing = records.find(
            (r) => r.attendanceDate.slice(0, 10) === todayKey
          );
          if (existing) {
            setAlreadySubmitted(true);
            setSubmitted({
              date: formatDate(new Date(existing.checkInTime)),
              time: formatTime(new Date(existing.checkInTime)),
              status: existing.status
            });
            setCurrentStep(4);
          }
        } catch {
          // ignore; submission will surface any real error
        }
      } catch {
        // ignore; keep the step flow usable without configuration
      } finally {
        if (active) setEntryLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Refresh the account profile so the face-setup prompt reflects the latest
  // state, and bind this browser as a verified device before checking in.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const fresh = await authService.me();
        if (active) {
          setFreshUser(fresh);
        }
      } catch {
        // profile refresh is best-effort
      }
      try {
        await attendanceService.provisionDevice();
      } catch {
        // device binding is best-effort; attendance still works
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function handleVerifyLocation() {
    setError(null);
    setLocationStatus(null);
    if (!("geolocation" in navigator)) {
      setLocationStatus({
        kind: "unable",
        title: "🔴 Unable to verify your location",
        message: "Please enable location permission and try again.",
        accuracy: 0
      });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const fix: LocationFix = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        };
        setLocationFix(fix);
        try {
          const result = await attendanceService.verifyLocation({
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy
          });
          if (result.verified && result.reason === "inside") {
            if (fix.accuracy > LOW_ACCURACY_THRESHOLD_METERS) {
              setLocationStatus({
                kind: "warning",
                title: "🟡 Location verified, but accuracy is low",
                message:
                  "Your location was verified, but GPS accuracy is low. Move to an open area for better accuracy.",
                accuracy: fix.accuracy
              });
            } else {
              setLocationStatus({
                kind: "verified",
                title: "🟢 Location verified",
                message: "You are within the school attendance area.",
                accuracy: fix.accuracy
              });
            }
            setCurrentStep(3);
          } else if (result.reason === "outside") {
            setLocationStatus({
              kind: "failed",
              title: "🔴 Location verification failed",
              message: "You are outside the allowed school attendance area.",
              accuracy: fix.accuracy
            });
          } else {
            setLocationStatus({
              kind: "failed",
              title: "🔴 Location verification failed",
              message:
                "Your location could not be verified. Please move to an open area for better accuracy and try again.",
              accuracy: fix.accuracy
            });
          }
        } catch {
          setLocationStatus({
            kind: "failed",
            title: "🔴 Location verification failed",
            message: "We could not verify your location right now. Please try again.",
            accuracy: fix.accuracy
          });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setLocationStatus({
          kind: "unable",
          title: "🔴 Unable to verify your location",
          message:
            err.code === 1
              ? "Please enable location permission and try again."
              : geolocationErrorMessage(err.code),
          accuracy: 0
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function handleSubmit() {
    if (!locationFix || !faceResult) return;
    setError(null);
    setLocationStatus(null);
    setSubmitting(true);
    try {
      const result = await attendanceService.submit({
        latitude: locationFix.latitude,
        longitude: locationFix.longitude,
        accuracy: locationFix.accuracy,
        embedding: faceResult.embedding,
        liveness: faceResult.liveness
      });
      setSubmitted({
        date: formatDate(new Date(result.attendanceDate)),
        time: formatTime(new Date(result.checkInTime)),
        status: result.status
      });
      setCurrentStep(4);
    } catch (err) {
      const message = getErrorMessage(err);
      if (message.toLowerCase().includes("already been recorded")) {
        setAlreadySubmitted(true);
        setCurrentStep(4);
      } else {
        setError(message);
        setCurrentStep(2);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const completed = alreadySubmitted || currentStep === 4;

  function handleFaceCaptured(result: LiveFaceResult) {
    setFaceResult({
      embedding: result.descriptor,
      liveness: result.livenessPassed
    });
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-4 sm:py-8">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">School Attendance</p>
            <p className="text-xs text-[hsl(var(--muted))]">
              {config?.schoolName ?? "Attendance"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--surface-alt))]"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <p className="mb-3 text-sm text-[hsl(var(--muted))]">{formatDateTime(now)}</p>

      <section className="card mb-4 p-4" aria-label="Profile">
        <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
          {user?.fullName}
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-[hsl(var(--muted))]">
          <li className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            {user?.email}
          </li>
          <li className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            {user?.phoneNumber}
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            {user?.department?.name}
          </li>
        </ul>
      </section>

      <ol
        className="mb-4 grid grid-cols-5 gap-1"
        aria-label="Attendance verification steps"
      >
        {steps.map((step, index) => {
          const done = completed || index < currentStep;
          const active = index === currentStep;
          const Icon = step.icon;
          return (
            <li
              key={step.label}
              className={`flex flex-col items-center gap-1 text-center ${
                active ? "text-brand-600 dark:text-brand-400" : "text-[hsl(var(--muted))]"
              }`}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                  done
                    ? "border-brand-600 bg-brand-600 text-white"
                    : active
                      ? "border-brand-500 bg-brand-500/10"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
                }`}
              >
                {done ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Icon className="h-4 w-4" aria-hidden />
                )}
              </span>
              <span className="text-[10px] font-medium sm:text-xs">{step.label}</span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mb-4">
          <Alert variant="error" message={error} />
        </div>
      )}

      {entryLoading ? (
        <p className="py-10 text-center text-sm text-[hsl(var(--muted))]">
          Verifying your records...
        </p>
      ) : (
        <>
          {currentStep === 2 && (
            <section className="card p-5" aria-label="Verify location">
              <div className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                <MapPin className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden />
                <h3 className="text-base font-bold">Verify your location</h3>
              </div>
              <p className="mt-2 text-sm text-[hsl(var(--muted))]">
                Your phone sends a one-time location reading while you are at
                school. It is checked against the school premises on the server
                and is never stored or tracked.
              </p>

              {locationStatus && (
                <div
                  className={`mt-4 rounded-xl border p-3 text-sm ${
                    locationStatus.kind === "verified"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : locationStatus.kind === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                        : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                  }`}
                  role={
                    locationStatus.kind === "failed" ||
                    locationStatus.kind === "unable"
                      ? "alert"
                      : "status"
                  }
                  aria-live="polite"
                >
                  <p className="flex items-center gap-2 font-medium">
                    {locationStatus.kind === "verified" ? (
                      <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
                    ) : locationStatus.kind === "warning" ? (
                      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <span>{locationStatus.title}</span>
                  </p>
                  <p className="mt-1 text-xs opacity-80">{locationStatus.message}</p>
                  {locationStatus.accuracy > 0 && (
                    <p className="mt-1 text-xs opacity-70">
                      GPS accuracy ~{locationStatus.accuracy} m
                    </p>
                  )}
                </div>
              )}

              <Button
                onClick={handleVerifyLocation}
                disabled={locating}
                loading={locating}
                loadingText="Locating..."
                className="mt-4 w-full"
              >
                {locationFix ? "Re-check my location" : "Verify my location"}
              </Button>
            </section>
          )}

          {currentStep === 3 && (
            <section className="card p-5" aria-label="Selfie and liveness">
              <div className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                <Camera
                  className="h-5 w-5 text-brand-600 dark:text-brand-400"
                  aria-hidden
                />
                <h3 className="text-base font-bold">Selfie + Liveness</h3>
              </div>

              {!freshUser ? (
                <p className="mt-4 text-sm text-[hsl(var(--muted))]">
                  Loading your profile...
                </p>
              ) : freshUser.faceReferenceStatus !== "REGISTERED" ? (
                <>
                  <Alert
                    variant="info"
                    message="Set up your face profile before checking in."
                  >
                    <p className="mt-1 text-sm">
                      Attendance needs a saved face reference. This takes about
                      a minute and is done once.
                    </p>
                  </Alert>
                  <Button
                    onClick={() => navigate("/face-setup")}
                    className="mt-4 w-full"
                  >
                    Set up my face profile
                  </Button>
                </>
              ) : (
                <>
                  <dl className="mt-2 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-[hsl(var(--muted))]">Location</dt>
                      <dd className="font-medium text-[hsl(var(--foreground))]">
                        {locationFix
                          ? `~${locationFix.accuracy} m accuracy`
                          : "Not verified"}
                      </dd>
                    </div>
                  </dl>

                  {!faceResult ? (
                    <div className="mt-4">
                      <FaceCapture
                        key={captureId}
                        startLabel="Verify my identity"
                        hint="Look at the camera, keep your face in the frame and blink a few times."
                        onSuccess={handleFaceCaptured}
                      />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <p className="flex items-center gap-2 font-medium">
                        <CircleCheck className="h-4 w-4" aria-hidden />
                        Identity verified
                      </p>
                      <p className="mt-1 text-xs opacity-80">
                        Your face was checked against your reference profile.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={handleSubmit}
                      disabled={!locationFix || !faceResult || submitting}
                      loading={submitting}
                      loadingText="Submitting..."
                      className="flex-1"
                    >
                      Submit attendance
                    </Button>
                    {faceResult && !submitting && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setFaceResult(null);
                          setCaptureId((c) => c + 1);
                        }}
                        className="sm:flex-none"
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        Retake
                      </Button>
                    )}
                  </div>
                </>
              )}
            </section>
          )}

          {currentStep === 4 && (
            <section
              className={`mb-4 rounded-2xl border p-5 ${
                alreadySubmitted
                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              }`}
              aria-live="polite"
            >
              <div className="flex items-center gap-2">
                <CircleCheck className="h-6 w-6" aria-hidden />
                <p className="text-base font-bold">
                  {alreadySubmitted
                    ? "Attendance already recorded"
                    : "Attendance recorded successfully"}
                </p>
              </div>
              {submitted && (
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="opacity-80">Name</dt>
                    <dd className="font-medium">{user?.fullName}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="opacity-80">Department</dt>
                    <dd className="font-medium">{user?.department?.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="opacity-80">Date</dt>
                    <dd className="font-medium">{submitted.date}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="opacity-80">Check-in</dt>
                    <dd className="font-medium">{submitted.time}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="opacity-80">Status</dt>
                    <dd>
                      <StatusBadge status={submitted.status} />
                    </dd>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-[hsl(var(--border))] pt-2">
                    <dt className="text-xs opacity-80">Location verified</dt>
                    <dd className="text-xs font-medium">Yes</dd>
                  </div>
                </dl>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}