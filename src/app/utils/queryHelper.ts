type TSortOrder = "asc" | "desc";

export type TPaginationResult = {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: TSortOrder;
};

export type TRawQuery = Record<string, unknown>;

// Alias for backward compatibility if needed, or just export it
export type PaginationOptions = TPaginationResult;

const getSingleValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) && value.length > 0) {
    return getSingleValue(value[0]);
  }
  return undefined;
};

const toPositiveNumber = (
  value: unknown,
  fallback: number,
  options?: { min?: number; max?: number }
): number => {
  // Use numeric value directly if already parsed, otherwise extract and parse
  const parsed = typeof value === "number" ? value : Number(getSingleValue(value));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  let result = Math.floor(parsed);

  if (options?.min !== undefined) {
    result = Math.max(options.min, result);
  }

  if (options?.max !== undefined) {
    result = Math.min(options.max, result);
  }

  return result;
};

const parsePagination = (query: TRawQuery): TPaginationResult => {
  const page = toPositiveNumber(query.page, 1, { min: 1 });
  const limit = toPositiveNumber(query.limit, 10, { min: 1, max: 100 });

  const sortBy = getSingleValue(query.sortBy) || "createdAt";

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
  parsePagination,
};
