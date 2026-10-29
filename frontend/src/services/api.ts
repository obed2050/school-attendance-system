import axios from "axios";
import { getToken } from "../utils/authStorage";

/**
 * API base URL. In development calls go through the Vite proxy (`/api`).
 * In production set `VITE_API_URL` to the deployed backend origin,
 * e.g. `https://your-app.up.railway.app`.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ?? "/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  // Send the HttpOnly `school_device` cookie set by the device-provisioning
  // endpoint on every request so attendance is bound to the browser's device.
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Extract a human-readable message from an API / axios error.
 */

/**
 * Extract a human-readable message from an API / axios error.
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as
      | {
          message?: unknown;
          errors?: unknown;
          details?: unknown;
        }
      | undefined;

    const message =
      typeof responseData?.message === "string"
        ? responseData.message
        : "";

    const details = Array.isArray(responseData?.details)
      ? responseData.details
      : Array.isArray(responseData?.errors)
        ? responseData.errors
        : [];

    if (details.length > 0) {
      const messages = details
        .map((item: unknown) => {
          if (typeof item === "string") {
            return item;
          }

          if (item && typeof item === "object") {
            const detail = item as {
              path?: unknown;
              field?: unknown;
              message?: unknown;
            };

            const field =
              typeof detail.field === "string"
                ? detail.field
                : Array.isArray(detail.path)
                  ? detail.path.join(".")
                  : "Field";

            const description =
              typeof detail.message === "string"
                ? detail.message
                : "Invalid value";

            return `${field}: ${description}`;
          }

          return null;
        })
        .filter((item): item is string => item !== null);

      if (messages.length > 0) {
        return `${message || "Validation failed"}: ${messages.join("; ")}`;
      }
    }

    if (message) {
      return message;
    }

    if (
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT"
    ) {
      return "The request timed out. Please try again.";
    }

    if (error.code === "ERR_NETWORK") {
      return "Could not reach the server. Please check your connection.";
    }

    return "Something went wrong. Please try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
