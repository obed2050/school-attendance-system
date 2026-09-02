import { useRef, useState } from "react";
import { Camera, RefreshCw, ScanFace } from "lucide-react";
import { useFaceCamera } from "../hooks/useFaceCamera";
import {
  loadFaceModels,
  runLiveFaceSession,
  LiveFaceResult
} from "../utils/faceDetection";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";
import { Spinner } from "./ui/Spinner";

interface FaceCaptureProps {
  onSuccess: (result: LiveFaceResult) => void;
  minBlinks?: number;
  minTrackedMs?: number;
  startLabel?: string;
  hint?: string;
}

/**
 * Camera + liveness capture panel. Starts the front camera, runs the blink
 * liveness session and reports the resulting face embedding to the caller.
 * Works for both face enrollment (/face-setup) and the daily attendance check.
 */
export function FaceCapture({
  onSuccess,
  minBlinks = 2,
  minTrackedMs = 2000,
  startLabel = "Start identity check",
  hint
}: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { startCamera, stopCamera, cameraReady, cameraError } =
    useFaceCamera(videoRef);

  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [blinksSoFar, setBlinksSoFar] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);

  async function ensureModels(): Promise<boolean> {
    setModelsError(null);
    setModelsLoading(true);
    try {
      await loadFaceModels();
      setModelsLoading(false);
      return true;
    } catch {
      setModelsLoading(false);
      setModelsError(
        "The face recognition models could not be loaded. Please check your connection and try again."
      );
      return false;
    }
  }

  async function handleStartCapture() {
    setCaptureError(null);
    setBlinksSoFar(0);
    if (!cameraReady) {
      setCaptureError("Start the camera first.");
      return;
    }
    const video = videoRef.current;
    if (!video) {
      setCaptureError("Camera is not ready yet.");
      return;
    }

    const ok = await ensureModels();
    if (!ok) return;

    setCapturing(true);
    try {
      const result = await runLiveFaceSession(video, {
        minBlinks,
        minTrackedMs,
        onProgress: ({ blinks }) => setBlinksSoFar(blinks)
      });

      if (!result.livenessPassed || result.descriptor.length !== 128) {
        setCaptureError(
          "We could not confirm you are a live person. Look at the camera and blink a few times, then retry."
        );
        setCapturing(false);
        return;
      }

      stopCamera();
      onSuccess(result);
    } catch {
      setCaptureError(
        "The identity check failed unexpectedly. Please try again."
      );
      setCapturing(false);
    }
  }

  return (
    <div className="space-y-4">
      {(cameraError || captureError || modelsError) && (
        <Alert
          variant="error"
          message={cameraError ?? captureError ?? modelsError ?? ""}
        />
      )}

      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />

        {capturing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
            <Spinner className="h-8 w-8" />
            <p className="px-4 text-center text-sm">
              Look at the camera and blink a few times...
            </p>
            <p className="text-xs opacity-90">
              Blinks detected: {blinksSoFar} / {minBlinks}
            </p>
          </div>
        )}
      </div>

      {hint && (
        <p className="text-sm text-[hsl(var(--muted))]">
          {capturing ? "Keep your face inside the camera frame." : hint}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {!capturing && !cameraReady && (
          <Button
            onClick={() => {
              setCaptureError(null);
              startCamera();
            }}
            className="flex-1"
          >
            <Camera className="h-4 w-4" aria-hidden />
            Start camera
          </Button>
        )}

        {!capturing && cameraReady && (
          <>
            <Button
              onClick={handleStartCapture}
              disabled={modelsLoading}
              loading={modelsLoading}
              loadingText="Loading models..."
              className="flex-1"
            >
              <ScanFace className="h-4 w-4" aria-hidden />
              {startLabel}
            </Button>
            <Button variant="secondary" onClick={stopCamera} className="sm:flex-none">
              <RefreshCw className="h-4 w-4" aria-hidden />
              <span className="sm:hidden">Restart camera</span>
              <span className="hidden sm:inline">Restart</span>
            </Button>
          </>
        )}

        {capturing && (
          <Button variant="secondary" onClick={stopCamera} disabled className="flex-1">
            Capturing...
          </Button>
        )}
      </div>
    </div>
  );
}