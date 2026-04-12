export type TSortOrder = "asc" | "desc";

export type TPaginationResult = {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: TSortOrder;
};

export type TRawQuery = Record<string, unknown>;

export type PaginationOptions = TPaginationResult;

/**
 * Normalizes input to a single primitive value.
 * Handles strings, numbers, booleans, and arrays (takes the first element).
 */
const getSingleValue = (value: unknown): string | number | boolean | undefined => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return getSingleValue(value[0]);
  }

  return undefined;
};

type ParseNumberOptions = {
  min?: number;
  max?: number;
  fallback?: number;
};

/**
 * Robustly parses a numeric query parameter with optional bounds and fallback.
 * Returns undefined (or fallback) if value is missing, invalid, or out of bounds.
 */
const parseNumber = (value: unknown, options: ParseNumberOptions = {}): number | undefined => {
  const normalized = getSingleValue(value);

  const hasFallback = Object.prototype.hasOwnProperty.call(options, "fallback");
  const fallback = options.fallback;

  if (normalized === undefined || normalized === null || normalized === "") {
    return hasFallback ? fallback : undefined;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return hasFallback ? fallback : undefined;
  }

  // Bounds checking
  if (options.min !== undefined && parsed < options.min) {
    return hasFallback ? fallback : undefined;
  }

  if (options.max !== undefined && parsed > options.max) {
    return hasFallback ? fallback : undefined;
  }

  return parsed;
};

type ParseBooleanOptions = {
  fallback?: boolean;
};

/**
 * Robustly parses a boolean query parameter.
 * Returns true for "true"/true, false for "false"/false.
 * Returns undefined (or fallback) for invalid input.
 */
const parseBoolean = (value: unknown, options: ParseBooleanOptions = {}): boolean | undefined => {
  const normalized = getSingleValue(value);

  const hasFallback = Object.prototype.hasOwnProperty.call(options, "fallback");
  const fallback = options.fallback;

  if (normalized === true || normalized === "true") return true;
  if (normalized === false || normalized === "false") return false;

  return hasFallback ? fallback : undefined;
};

/**
 * Specialized helper for positive integers, used primarily for pagination.
 * Unlike parseNumber, this defaults to fallback and floors the result.
 */
const toPositiveNumber = (
  value: unknown,
  fallback: number,
  options?: { min?: number; max?: number }
): number => {
  const parsed = parseNumber(value, {
    min: options?.min ?? 1,
    max: options?.max,
    // We don't provide a fallback to parseNumber here so we can handle the "invalid -> fallback" logic ourselves
  });

  if (parsed === undefined) {
    return fallback;
  }

  return Math.floor(parsed);
};

const parsePagination = (query: TRawQuery): TPaginationResult => {
  const page = toPositiveNumber(query.page, 1, { min: 1 });
  const limit = toPositiveNumber(query.limit, 10, { min: 1, max: 100 });

  const sortBy = String(getSingleValue(query.sortBy) || "createdAt");

  const rawSortOrder = getSingleValue(query.sortOrder);
  const sortOrder: TSortOrder = rawSortOrder === "asc" ? "asc" : "desc";

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sortBy,
    sortOrder,
  };
};

export const queryHelper = {
  getSingleValue,
  parseNumber,
  parseBoolean,
  parsePagination,
};

