/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Production API base URL, e.g. https://school-attendance-api.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}