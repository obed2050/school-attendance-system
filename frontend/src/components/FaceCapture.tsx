import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, ScanFace } from "lucide-react";

import { useFaceCamera } from "../hooks/useFaceCamera";
import {
  DESCRIPTOR_LENGTH,
  loadFaceModels,
  runLiveFaceSession,
  type LiveFaceResult,
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

function isValidDescriptor(descriptor: number[]): boolean {
  if (
    descriptor.length !== DESCRIPTOR_LENGTH ||
    !descriptor.every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 100
    )
  ) {
    return false;
  }

  const norm = Math.sqrt(
    descriptor.reduce((sum, value) => sum + value * value, 0)
  );

  return Number.isFinite(norm) && norm > 1e-12;
}

export function FaceCapture({
  onSuccess,
  minBlinks = 2,
  minTrackedMs = 2000,
  startLabel = "Start face verification",
  hint,
}: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  const {
    startCamera,
    stopCamera,
    cameraReady,
    cameraError,
  } = useFaceCamera(videoRef);

  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [blinksSoFar, setBlinksSoFar] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      captureAbortRef.current?.abort();
      captureAbortRef.current = null;
    };
  }, []);

  async function ensureModels(): Promise<boolean> {
    if (mountedRef.current) {
      setModelsError(null);
      setModelsLoading(true);
    }

    try {
      await loadFaceModels();
      return true;
    } catch {
      if (mountedRef.current) {
        setModelsError(
          "Face recognition models could not be loaded. Check your connection and try again."
        );
      }

      return false;
    } finally {
      if (mountedRef.current) {
        setModelsLoading(false);
      }
    }
  }

  function cancelCapture() {
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;

    setCapturing(false);
    setBlinksSoFar(0);
    stopCamera();
  }

  async function handleStartCapture() {
    if (capturing) return;

    setCaptureError(null);
    setModelsError(null);
    setBlinksSoFar(0);

    if (!cameraReady) {
      setCaptureError("Start the camera first.");
      return;
    }

    const video = videoRef.current;

    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setCaptureError(
        "The camera is not ready yet. Wait for the video to appear and try again."
      );
      return;
    }

    const controller = new AbortController();
    captureAbortRef.current = controller;
    setCapturing(true);

    try {
      const modelsReady = await ensureModels();

      if (!modelsReady || controller.signal.aborted) {
        return;
      }

      const result = await runLiveFaceSession(video, {
        minBlinks,
        minTrackedMs,
        timeoutMs: 45000,
        blinkMaxMs: 500,
        earThresh: 0.24,
        signal: controller.signal,
        onProgress: ({ blinks }) => {
          if (mountedRef.current && !controller.signal.aborted) {
            setBlinksSoFar(blinks);
          }
        },
      });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (
        !result.livenessPassed ||
        !result.faceVisible ||
        !isValidDescriptor(result.descriptor)
      ) {
        setCaptureError(
          "We could not validate your face. Keep your face in view, look at the camera, blink naturally, and try again."
        );
        return;
      }

      setCapturing(false);
      captureAbortRef.current = null;
      stopCamera();

      onSuccess(result);
    } catch (error: unknown) {
      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      const errorName = error instanceof Error ? error.name : "";

      if (errorName === "TimeoutError") {
        setCaptureError(
          "Face verification took too long. Keep your face centered, look at the camera, blink naturally twice, and try again."
        );
      } else if (errorName === "AbortError") {
        setCaptureError("Face verification was cancelled.");
      } else {
        setCaptureError(
          "Face verification failed. Check the camera and try again."
        );
      }
    } finally {
      if (captureAbortRef.current === controller) {
        captureAbortRef.current = null;

        if (mountedRef.current) {
          setCapturing(false);
        }
      }
    }
  }

  const displayedError = cameraError || captureError || modelsError;

  return (
    <div className="space-y-4">
      {displayedError && (
        <Alert variant="error" message={displayedError} />
      )}

      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Face verification camera"
          className="aspect-[4/3] w-full object-cover"
        />

        {!cameraReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-950 text-white">
            <Camera size={36} />
            <p className="text-sm">Camera is not running</p>
          </div>
        )}

        {capturing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 px-4 text-center text-white">
            <Spinner />
            <p className="font-medium">
              {modelsLoading
                ? "Loading face recognition models..."
                : "Verifying your face..."}
            </p>

            {!modelsLoading && (
              <p className="text-sm">
                Blinks detected: {blinksSoFar} / {minBlinks}
              </p>
            )}

            <p className="text-xs">
              Keep your face in view and blink naturally.
            </p>
          </div>
        )}
      </div>

      {hint && <p className="text-sm text-gray-600">{hint}</p>}

      <div className="flex flex-wrap gap-3">
        {!cameraReady ? (
          <Button onClick={startCamera}>
            <Camera size={16} className="mr-2" />
            Start camera
          </Button>
        ) : capturing ? (
          <Button onClick={cancelCapture} variant="secondary">
            Cancel verification
          </Button>
        ) : (
          <Button onClick={handleStartCapture} disabled={modelsLoading}>
            {modelsLoading ? (
              <Spinner />
            ) : (
              <ScanFace size={16} className="mr-2" />
            )}
            {modelsLoading ? "Loading models..." : startLabel}
          </Button>
        )}

        {cameraReady && !capturing && (
          <Button
            onClick={async () => {
              setCaptureError(null);
              setModelsError(null);
              await startCamera();
            }}
            variant="secondary"
          >
            <RefreshCw size={16} className="mr-2" />
            Restart camera
          </Button>
        )}
      </div>
    </div>
  );
}
