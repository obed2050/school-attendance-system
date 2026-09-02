import * as tf from "@tensorflow/tfjs";
import * as faceapi from "@vladmandic/face-api";
import type {
  WithFaceDescriptor,
  FaceLandmarks68
} from "@vladmandic/face-api";

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
  onProgress?: (info: { blinks: number; frames: number }) => void;
}

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Load the tiny face detector, 68-point landmark model and the recognition
 * net once per session. The weights are copied to the Vite `public/models`
 * folder and served from `/models`.
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      modelsLoaded = true;
    })();
  }
  await loadingPromise;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Eye aspect ratio for the 6 landmarks of one eye (outer corner at index 0,
 * inner corner at index 3). Drops toward ~0 when the eye is closed, which is
 * what lets us count natural blinks on the live camera feed.
 */
export function eyeAspectRatio(points: { x: number; y: number }[]): number | null {
  if (!points || points.length < 6) return null;
  const v1 = distance(points[1], points[5]);
  const v2 = distance(points[2], points[4]);
  const h = distance(points[0], points[3]);
  if (h === 0) return null;
  return (v1 + v2) / (2 * h);
}

/**
 * Run a live face-capture session against a <video> element.
 *
 * The routine tracks the face continuously and counts real blinks from the
 * eye-landmark geometry. A printed photo / screenshot cannot blink, and the
 * tracking window is thrown away whenever the face disappears for a few
 * frames, so a static image never satisfies the liveness requirement.
 *
 * The returned descriptor is the element-wise average of every accepted face
 * descriptor captured during the session (128 floats), suitable for the
 * backend `face-reference` and attendance endpoints.
 */
export async function runLiveFaceSession(
  video: HTMLVideoElement,
  options: LiveFaceOptions = {}
): Promise<LiveFaceResult> {
  const minBlinks = options.minBlinks ?? 2;
  const minTrackedMs = options.minTrackedMs ?? 2000;
  const blinkMaxMs = options.blinkMaxMs ?? 260;
  const earThresh = options.earThresh ?? 0.2;

  const detectionOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.5
  });

  let framesTracked = 0;
  let consecutiveMisses = 0;
  let blinksDetected = 0;
  let trackedStartMs = 0;
  let descriptorAccumulator: Float32Array | null = null;
  let faceSeen = false;

  let earRing: number[] = [];
  let eyeClosedAt: number | null = null;

  const scrub = () => {
    framesTracked = 0;
    blinksDetected = 0;
    trackedStartMs = 0;
    descriptorAccumulator = null;
    earRing = [];
    eyeClosedAt = null;
  };

  await new Promise<void>((resolve) => {
    const tick = async (timestamp: number) => {
      if (video.readyState < 2) {
        requestAnimationFrame(tick);
        return;
      }

      type TrackedFace = WithFaceDescriptor<{ landmarks: FaceLandmarks68 }>;
      let detection: TrackedFace | null = null;

      try {
        detection =
          (await faceapi
            .detectSingleFace(video, detectionOptions)
            .withFaceLandmarks()
            .withFaceDescriptor()) ?? null;
      } catch {
        resolve();
        return;
      }

      if (!detection) {
        consecutiveMisses += 1;
        // A live feed does not drop the face for long; reset the blink history
        // so pausing a printed photo mid-capture cannot fabricate a blink.
        if (consecutiveMisses > 3) {
          scrub();
        }
        requestAnimationFrame(tick);
        return;
      }

      faceSeen = true;
      consecutiveMisses = 0;
      if (framesTracked === 0) trackedStartMs = timestamp;

      const leftEar = eyeAspectRatio(detection.landmarks.getLeftEye());
      const rightEar = eyeAspectRatio(detection.landmarks.getRightEye());
      const ear =
        leftEar !== null && rightEar !== null ? Math.min(leftEar, rightEar) : null;

      if (ear !== null) {
        earRing.push(ear);
        if (earRing.length > 6) earRing.shift();

        if (ear < earThresh) {
          if (eyeClosedAt === null) {
            eyeClosedAt = timestamp;
          } else if (timestamp - eyeClosedAt > blinkMaxMs) {
            // Held shut too long — suspicious static image, keep counting a
            // fresh closure from now.
            eyeClosedAt = timestamp;
          }
        } else if (eyeClosedAt !== null) {
          const closedDuration = timestamp - eyeClosedAt;
          if (closedDuration >= 30) {
            blinksDetected += 1;
          }
          eyeClosedAt = null;
        }
      }

      const descriptor = detection.descriptor as Float32Array;
      if (descriptorAccumulator === null) {
        descriptorAccumulator = new Float32Array(descriptor);
      } else {
        for (let i = 0; i < descriptor.length; i += 1) {
          descriptorAccumulator[i] += descriptor[i];
        }
      }

      framesTracked += 1;

      const trackedMs = timestamp - trackedStartMs;
      const passed =
        blinksDetected >= minBlinks &&
        framesTracked >= 10 &&
        trackedMs >= minTrackedMs;

      if (!passed) {
        options.onProgress?.({ blinks: blinksDetected, frames: framesTracked });
        requestAnimationFrame(tick);
        return;
      }
      options.onProgress?.({ blinks: blinksDetected, frames: framesTracked });
      resolve();
    };

    requestAnimationFrame(tick);
  });

  const trackedMs = performance.now() - trackedStartMs;

  let descriptor: number[] = [];
  const accumulator: Float32Array | null = descriptorAccumulator;
  if (accumulator !== null && framesTracked > 0) {
    const merged: Float32Array = accumulator;
    for (let i = 0; i < merged.length; i += 1) {
      merged[i] /= framesTracked;
    }
    const norm = Math.sqrt(
      Array.from(merged).reduce((sum, value) => sum + value * value, 0)
    );
    if (norm > 0) {
      for (let i = 0; i < merged.length; i += 1) {
        merged[i] /= norm;
      }
      descriptor = Array.from(merged).slice(0, DESCRIPTOR_LENGTH);
    }
  }

  return {
    descriptor,
    livenessPassed:
      blinksDetected >= minBlinks && framesTracked >= 10 && trackedMs >= minTrackedMs,
    blinksDetected,
    framesTracked,
    faceVisible: faceSeen
  };
}

/** Average several enrollment captures into a single stable embedding. */
export function mergeEmbeddings(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const length = vectors[0].length;
  const sum = new Array(length).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < length; i += 1) {
      sum[i] += v[i];
    }
  }
  const average = sum.map((value) => value / vectors.length);
  const norm = Math.sqrt(
    average.reduce((acc, value) => acc + value * value, 0)
  );
  if (norm === 0) return average;
  return average.map((value) => value / norm);
}