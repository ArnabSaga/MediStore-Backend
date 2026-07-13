import { envVars } from "./env";

/**
 * Normalizes an origin string for reliable comparison.
 * Extracts only the protocol, host, and port components.
 */
export const normalizeOrigin = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    console.warn(`[CORS] Invalid origin format encountered: "${url}"`);
    return null;
  }
};

/**
 * Returns the exact frontend origins allowed to call MediStore auth/API routes.
 */
export const getAllowedOrigins = (): string[] => {
  const frontendOrigin = normalizeOrigin(envVars.FRONTEND_URL);

  if (!frontendOrigin) {
    throw new Error("FRONTEND_URL must be a valid origin.");
  }

  const origins = [frontendOrigin];

  const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL_ENV;
  if (!isVercel || envVars.NODE_ENV === "development") {
    origins.push("http://localhost:3000");
    origins.push("http://127.0.0.1:3000");
  }

  return [...new Set(origins)];
};

/**
 * Pre-calculated whitelist for application use.
 */
export const allowedOrigins = getAllowedOrigins();

/**
 * Validates if a request origin is permitted.
 */
export const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return allowedOrigins.includes(normalized);
};

/**
 * Returns the canonical frontend URL for absolute links.
 */
export const getPrimaryFrontendOrigin = (): string => {
  return allowedOrigins[0];
};
