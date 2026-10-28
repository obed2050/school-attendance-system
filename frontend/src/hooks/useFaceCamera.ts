
import {
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export function useFaceCamera(
  videoRef: RefObject<HTMLVideoElement>
) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);

  const stopCamera = useCallback(() => {
    // Invalidates any getUserMedia request that is still pending.
    requestIdRef.current += 1;

    const stream = streamRef.current;
    streamRef.current = null;

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    const video = videoRef.current;

    if (video && (!stream || video.srcObject === stream)) {
      video.pause();
      video.srcObject = null;
    }

    if (mountedRef.current) {
      setCameraReady(false);
    }
  }, [videoRef]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera access is not supported in this browser. Use a supported browser and HTTPS."
      );
      return;
    }

    const requestId = requestIdRef.current;
    let acquiredStream: MediaStream | null = null;

    try {
      acquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      // If a newer request started or the component was unmounted,
      // stop this stream instead of attaching it.
      if (
        requestId !== requestIdRef.current ||
        !mountedRef.current
      ) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = acquiredStream;

      const video = videoRef.current;

      if (!video) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }

      video.srcObject = acquiredStream;
      await video.play();

      // The request may have been cancelled while video.play() was pending.
      if (
        requestId !== requestIdRef.current ||
        !mountedRef.current ||
        streamRef.current !== acquiredStream
      ) {
        acquiredStream.getTracks().forEach((track) => track.stop());

        if (video.srcObject === acquiredStream) {
          video.pause();
          video.srcObject = null;
        }

        return;
      }

      setCameraReady(true);
    } catch (error: unknown) {
      if (acquiredStream) {
        acquiredStream.getTracks().forEach((track) => track.stop());

        if (streamRef.current === acquiredStream) {
          streamRef.current = null;
        }

        const video = videoRef.current;

        if (video?.srcObject === acquiredStream) {
          video.pause();
          video.srcObject = null;
        }
      }

      // Do not show errors for an obsolete request.
      if (
        requestId !== requestIdRef.current ||
        !mountedRef.current
      ) {
        return;
      }

      setCameraReady(false);

      const errorName =
        error instanceof Error ? error.name : "";

      if (
        errorName === "NotAllowedError" ||
        errorName === "SecurityError"
      ) {
        setCameraError(
          "Camera permission was denied. Allow camera access in your browser settings and try again."
        );
      } else if (errorName === "NotFoundError") {
        setCameraError(
          "No camera was found. Connect or enable a camera and try again."
        );
      } else if (errorName === "NotReadableError") {
        setCameraError(
          "The camera may be in use by another application. Close that application and try again."
        );
      } else {
        setCameraError(
          "The camera could not be started. Check your camera connection and browser permissions, then try again."
        );
      }
    }
  }, [stopCamera, videoRef]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  return {
    startCamera,
    stopCamera,
    cameraReady,
    cameraError,
  };
}
