import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, GraduationCap } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authService } from "../services";
import { getErrorMessage } from "../services/api";
import { mergeEmbeddings } from "../utils/faceDetection";
import { FaceCapture } from "../components/FaceCapture";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { Spinner } from "../components/ui/Spinner";

const REQUIRED_SAMPLES = 3;

/**
 * Staff face enrollment. First-time enrollment stores the reference
 * embedding; re-enrollment first "proves" the existing face, then stores the
 * new one (the backend enforces this with `current_embedding`).
 */
export function FaceSetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const needsProof = user?.faceReferenceStatus === "REGISTERED";
  const [proof, setProof] = useState<number[] | null>(null);
  const [samples, setSamples] = useState<number[][]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const totalCaptures = needsProof ? 1 + REQUIRED_SAMPLES : REQUIRED_SAMPLES;
  const waitingForProof = needsProof && !proof;

  async function handleCapture(descriptor: number[]) {
    setError(null);

    if (waitingForProof) {
      setProof(descriptor);
      return;
    }

    const next = [...samples, descriptor];
    setSamples(next);

    if (next.length >= REQUIRED_SAMPLES) {
      await saveProfile();
    }
  }

  async function saveProfile() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const embedding = mergeEmbeddings(samples);
      await authService.faceReference(embedding, proof ?? undefined);
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10">
        <div className="card w-full p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">
            Face profile saved
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted))]">
            Your reference face is now encrypted and stored. You can check in
            for attendance.
          </p>
          <Button
            className="mt-5 w-full"
            onClick={() => navigate("/attendance", { replace: true })}
          >
            Go to attendance
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-10 pt-4 sm:py-8">
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/attendance")}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--surface-alt))]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">Face profile setup</p>
            <p className="text-xs text-[hsl(var(--muted))]">
              {user?.fullName}
            </p>
          </div>
        </div>
      </header>

      <section className="card p-5">
        {needsProof && error && (
          <div className="mb-4">
            <Alert variant="error" message={error} />
          </div>
        )}

        {needsProof && (
          <div className="mb-4">
            <Alert
              variant={waitingForProof ? "info" : "success"}
              message={
                waitingForProof
                  ? "Step 1 of 2 — confirm it is still you before replacing your saved face."
                  : "Identity confirmed. Now capture your new reference face."
              }
            />
          </div>
        )}

        {!needsProof && (
          <div className="mb-4">
            <Alert
              variant="info"
              message="Capture your face in good lighting, without glasses or glare."
            />
          </div>
        )}

        <ol className="mb-4 space-y-1.5 text-sm text-[hsl(var(--muted))]">
          <li>
            {waitingForProof
              ? "• Capture your current face to confirm your identity."
              : "• Look at the camera and blink a few times."}
          </li>
          {needsProof && !waitingForProof && (
            <li>• Capture your new reference face (3 quick captures).</li>
          )}
          {!needsProof && (
            <li>
              • Capture {totalCaptures} short clips so the template is stable.
            </li>
          )}
        </ol>

        <div className="mb-4">
          <FaceCapture
            key={`${waitingForProof ? "proof" : `sample-${samples.length}`}`}
            minBlinks={waitingForProof ? 1 : 2}
            minTrackedMs={waitingForProof ? 1200 : 2000}
            startLabel={
              waitingForProof ? "Confirm my identity" : "Capture my face"
            }
            hint={waitingForProof ? undefined : `Capture ${samples.length + 1} of ${REQUIRED_SAMPLES}`}
            onSuccess={({ descriptor }) => void handleCapture(descriptor)}
          />
        </div>

        {error && !needsProof && (
          <div className="mb-4">
            <Alert variant="error" message={error} />
          </div>
        )}

        {submitting && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[hsl(var(--muted))]">
            <Spinner className="h-4 w-4" />
            Saving your face profile...
          </div>
        )}
      </section>

      <p className="mt-4 text-xs leading-relaxed text-[hsl(var(--muted))]">
        Privacy: only a mathematical face signature (embedding) is encrypted and
        stored on the server. No photo is ever uploaded or kept. Freshest
        photos are processed only on your device, in your browser.
      </p>
    </div>
  );
}