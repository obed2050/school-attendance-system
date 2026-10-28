
import * as tf from "@tensorflow/tfjs";
import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "/models";

export const DESCRIPTOR_LENGTH = 128;

export interface LiveFaceResult {
  descriptor: number[];
  livenessPassed: boolean;
  blinksDetected: number;
  framesTracked: number;
  faceVisible: boolean;
}

export interface LiveFaceOptions {
  minBlinks?: number;
  minTrackedMs?: number;
  blinkMaxMs?: number;
  earThresh?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (info: { blinks: number; frames: number }) => void;
}

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;

  if (!loadingPromise) {
    const attempt = (async () => {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }

      await tf.ready();

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      modelsLoaded = true;
    })();

    loadingPromise = attempt.catch((error: unknown) => {
      // Emera models zanze gupakira, kugira ngo retry izongere kugerageza.
      loadingPromise = null;
      throw error;
    });
  }

  await loadingPromise;
}

function makeSessionError(
  message: string,
  name: "AbortError" | "TimeoutError" | "FaceDetectionError"
): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function eyeAspectRatio(points: Array<{ x: number; y: number }>): number {
  if (points.length < 6) return 0;

  const distance = (
    a: { x: number; y: number },
    b: { x: number; y: number }
  ) => Math.hypot(a.x - b.x, a.y - b.y);

  const verticalOne = distance(points[1], points[5]);
  const verticalTwo = distance(points[2], points[4]);
  const horizontal = distance(points[0], points[3]);

  if (horizontal <= 0) return 0;

  return (verticalOne + verticalTwo) / (2 * horizontal);
}

function normalizeDescriptor(values: number[]): number[] | null {
  if (
    values.length !== DESCRIPTOR_LENGTH ||
    !values.every((value) => Number.isFinite(value))
  ) {
    return null;
  }

  const norm = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0)
  );

  if (!Number.isFinite(norm) || norm < 1e-12) {
    return null;
  }

  return values.map((value) => value / norm);
}

export async function runLiveFaceSession(
  video: HTMLVideoElement,
  options: LiveFaceOptions = {}
): Promise<LiveFaceResult> {
  const minBlinks = options.minBlinks ?? 2;
  const minTrackedMs = options.minTrackedMs ?? 2000;
  const blinkMaxMs = options.blinkMaxMs ?? 300;
  const earThresh = options.earThresh ?? 0.2;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const signal = options.signal;

  if (signal?.aborted) {
    throw makeSessionError("Face capture was cancelled.", "AbortError");
  }

  if (!modelsLoaded) {
    throw makeSessionError(
      "Face recognition models are not loaded.",
      "FaceDetectionError"
    );
  }

  if (
    !Number.isFinite(minBlinks) ||
    minBlinks < 1 ||
    !Number.isFinite(minTrackedMs) ||
    minTrackedMs < 0 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw makeSessionError(
      "Invalid face capture settings.",
      "FaceDetectionError"
    );
  }

  const detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.5,
  });

  let framesTracked = 0;
  let blinksDetected = 0;
  let consecutiveMisses = 0;
  let trackedStartMs: number | null = null;
  let descriptorAccumulator: Float64Array | null = null;
  let eyeClosedAt: number | null = null;
  let faceSeen = false;
  let earSamples: number[] = [];
  let animationFrameId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  return new Promise<LiveFaceResult>((resolve, reject) => {
    const cleanup = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      signal?.removeEventListener("abort", handleAbort);
    };

    const finish = (
      result?: LiveFaceResult,
      error?: Error
    ) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      } else {
        reject(
          makeSessionError(
            "Face capture could not be completed.",
            "FaceDetectionError"
          )
        );
      }
    };

    const handleAbort = () => {
      finish(
        undefined,
        makeSessionError("Face capture was cancelled.", "AbortError")
      );
    };

    const resetTracking = () => {
      framesTracked = 0;
      blinksDetected = 0;
      trackedStartMs = null;
      descriptorAccumulator = null;
      eyeClosedAt = null;
      earSamples = [];
    };

    const scheduleNextFrame = () => {
      if (!settled) {
        animationFrameId = requestAnimationFrame(processFrame);
      }
    };

    const processFrame = async (timestamp: number) => {
      if (settled) return;

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      try {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          scheduleNextFrame();
          return;
        }

        const detection = await faceapi
          .detectSingleFace(video, detectorOptions)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (settled) return;

        if (signal?.aborted) {
          handleAbort();
          return;
        }

        if (!detection) {
          consecutiveMisses += 1;

          // Iyo mu maso yabuze frames nyinshi, dutangira tracking bundi bushya.
          if (consecutiveMisses > 3) {
            resetTracking();
          }

          options.onProgress?.({
            blinks: blinksDetected,
            frames: framesTracked,
          });

          scheduleNextFrame();
          return;
        }

        faceSeen = true;
        consecutiveMisses = 0;

        if (trackedStartMs === null) {
          trackedStartMs = timestamp;
        }

        const leftEye = eyeAspectRatio(
          detection.landmarks.getLeftEye()
        );
        const rightEye = eyeAspectRatio(
          detection.landmarks.getRightEye()
        );

        const ear = (leftEye + rightEye) / 2;

        // Average y'ama-frame atatu igabanya ingaruka z'urusaku rwa detection.
        earSamples.push(ear);
        if (earSamples.length > 3) {
          earSamples.shift();
        }

        const smoothedEar =
          earSamples.reduce((sum, value) => sum + value, 0) /
          earSamples.length;

        if (smoothedEar < earThresh) {
          // Ntitubara blink kugeza amaso yongeye gufunguka.
          if (eyeClosedAt === null) {
            eyeClosedAt = timestamp;
          }
        } else if (eyeClosedAt !== null) {
          const closedDuration = timestamp - eyeClosedAt;

          if (
            closedDuration >= 50 &&
            closedDuration <= blinkMaxMs
          ) {
            blinksDetected += 1;
          }

          // Gufunguka nyuma yo gufunga igihe kirekire ntibibarwa nka blink.
          eyeClosedAt = null;
        }

        const descriptor = Array.from(detection.descriptor);

        if (
          descriptor.length !== DESCRIPTOR_LENGTH ||
          !descriptor.every(Number.isFinite)
        ) {
          throw makeSessionError(
            "Invalid face descriptor received.",
            "FaceDetectionError"
          );
        }

        if (descriptorAccumulator === null) {
          descriptorAccumulator = new Float64Array(DESCRIPTOR_LENGTH);
        }

        for (let i = 0; i < DESCRIPTOR_LENGTH; i += 1) {
          descriptorAccumulator[i] += descriptor[i];
        }

        framesTracked += 1;

        options.onProgress?.({
          blinks: blinksDetected,
          frames: framesTracked,
        });

        const trackedMs =
          trackedStartMs === null ? 0 : timestamp - trackedStartMs;

        const livenessPassed =
          blinksDetected >= minBlinks &&
          framesTracked >= 10 &&
          trackedMs >= minTrackedMs;

        if (!livenessPassed) {
          scheduleNextFrame();
          return;
        }

        const averagedDescriptor = Array.from(
          descriptorAccumulator,
          (value) => value / framesTracked
        );

        const normalizedDescriptor = normalizeDescriptor(
          averagedDescriptor
        );

        if (!normalizedDescriptor) {
          throw makeSessionError(
            "The face descriptor could not be validated.",
            "FaceDetectionError"
          );
        }

        finish({
          descriptor: normalizedDescriptor,
          livenessPassed: true,
          blinksDetected,
          framesTracked,
          faceVisible: faceSeen,
        });
      } catch (error: unknown) {
        if (settled) return;

        const sessionError =
          error instanceof Error
            ? error
            : makeSessionError(
                "Face detection failed.",
                "FaceDetectionError"
              );

        finish(undefined, sessionError);
      }
    };

    signal?.addEventListener("abort", handleAbort, { once: true });

    timeoutId = setTimeout(() => {
      finish(
        undefined,
        makeSessionError(
          "Face capture timed out. Please try again.",
          "TimeoutError"
        )
      );
    }, timeoutMs);

    scheduleNextFrame();
  });
}

export function mergeEmbeddings(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error("At least one face embedding is required.");
  }

  const validVectors = vectors.filter(
    (vector) =>
      vector.length === DESCRIPTOR_LENGTH &&
      vector.every(Number.isFinite)
  );

  if (validVectors.length === 0) {
    throw new Error("No valid face embeddings were provided.");
  }

  const average = new Array<number>(DESCRIPTOR_LENGTH).fill(0);

  for (const vector of validVectors) {
    for (let i = 0; i < DESCRIPTOR_LENGTH; i += 1) {
      average[i] += vector[i] / validVectors.length;
    }
  }

  const normalized = normalizeDescriptor(average);

  if (!normalized) {
    throw new Error("The merged face embedding is invalid.");
  }

  return normalized;
}
