import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "../config/env";

/**
 * Biometric template handling.
 *
 * A reference face is stored as a 128-dimensional embedding produced on the
 * staff member's device. Storing an embedding is purposefully chosen over a
 * raw face image so that PostgreSQL never holds a reconstructable photograph.
 * On top of that the encoded embedding is encrypted at rest with AES-256-GCM;
 * the key is derived from `FACE_ENCRYPTION_KEY` (or, in development, from the
 * JWT secret) so no plaintext biometric material ever touches the database.
 *
 * Nothing here returns the threshold to callers - a caller only learns
 * PASS/FAIL. This keeps similarity margins away from end users.
 */

const EMBEDDING_LENGTH = 128;
const KEY_SCHEME = "enc";
const KEY_VERSION = "v1";

function getEncryptionKey(): Buffer {
  const seed = env.FACE_ENCRYPTION_KEY || env.JWT_SECRET;
  return createHash("sha256").update(`${seed}:face-template-v1`, "utf8").digest();
}

/**
 * Serialise + encrypt an embedding for storage.
 * Format: enc:v1:base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptEmbedding(vector: number[]): string {
  const payload = Buffer.from(new Float32Array(vector).buffer);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${KEY_SCHEME}:${KEY_VERSION}:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Decrypt + parse a stored embedding. Throws if the payload is invalid. */
export function decryptEmbedding(value: string): number[] {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== KEY_SCHEME || parts[1] !== KEY_VERSION) {
    throw new Error("Invalid face template format");
  }
  const [, , ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const payload = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]);
  return Array.from(new Float32Array(payload.buffer, payload.byteOffset, payload.byteLength / 4));
}

export function isPlausibleEmbedding(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  if (value.length !== EMBEDDING_LENGTH) return false;
  return value.every(
    (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 100
  );
}

/**
 * Cosine similarity between two normalized-recognition embeddings.
 * Returns a value in [-1, 1]; identical faces score near 1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Internal similarity threshold. Never exposed through any API. */
const FACE_MATCH_THRESHOLD = env.FACE_MATCH_THRESHOLD;

export function faceMatches(similarity: number): boolean {
  return similarity >= FACE_MATCH_THRESHOLD;
}

/** User-facing message; deliberately generic to hide scoring internals. */
export const IDENTITY_VERIFICATION_FAILED =
  "Identity verification failed. Please try again.";