import { envVars } from "./env";

/**
 * Normalizes an origin string for reliable comparison.
 * Extracts only the protocol, host, and port components.
 */
export const normalizeOrigin = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Return only origin (scheme + host + port)
    return parsed.origin;
  } catch (err) {
    console.warn(`[CORS] Invalid origin format encountered: "${url}"`);
    return null;
  }
};

/**
 * Derives a clean list of allowed origins from environment configuration.
 * Supports comma-separated FRONTEND_URL values.
 */
export const getWhitelistedOrigins = (): string[] => {
  const rawUrl = envVars.FRONTEND_URL || "";
  
  // Use a sensible default for local dev if FRONTEND_URL is missing
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  
  // Split by comma and filter valid origins
  const envOrigins = rawUrl
    .split(",")
    .map((u) => u.trim())
    .map((u) => normalizeOrigin(u))
    .filter((u): u is string => u !== null);

  const combined = envOrigins.length > 0 ? envOrigins : defaults;

  if (envOrigins.length === 0 && envVars.NODE_ENV === "production") {
    console.warn("⚠️ [CORS] No valid frontend origins were found in FRONTEND_URL variable. Falling back to defaults.");
  }

  return [...new Set(combined)]; // Ensure uniqueness
};

/**
 * Pre-calculated whitelist for application use.
 */
export const whitelistedOrigins = getWhitelistedOrigins();

/**
 * Validates if a request origin is permitted.
 */
export const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return whitelistedOrigins.includes(normalized);
};

/**
 * Returns the primary frontend URL for absolute link generation (e.g. emails).
 */
export const getPrimaryFrontendOrigin = (): string => {
  return whitelistedOrigins[0];
};
