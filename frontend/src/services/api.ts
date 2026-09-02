import axios, { AxiosError } from "axios";
import { getToken } from "../utils/authStorage";
import { ApiErrorData } from "../types";

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
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorData>;
    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message;
    }
    if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
      return "The request timed out. Please try again.";
    }
    if (axiosError.code === "ERR_NETWORK") {
      return "Could not reach the server. Please check your connection.";
    }
    return "Something went wrong. Please try again.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
