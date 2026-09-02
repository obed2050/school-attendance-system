import { RefObject, useCallback, useEffect, useRef, useState } from "react";

/**
 * Manage a `getUserMedia` video stream bound to a <video> element for the
 * face-capture and liveness screens. The stream is always torn down when the
 * component unmounts so the camera light turns off and no feed is left open.
 */
export function useFaceCamera(videoRef: RefObject<HTMLVideoElement>) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }

      video.srcObject = stream;
      await video.play();
      setCameraReady(true);
    } catch {
      setCameraError(
        "Camera permission was denied. Please allow camera access and try again."
      );
    }
  }, [videoRef, stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return { startCamera, stopCamera, cameraReady, cameraError };
}