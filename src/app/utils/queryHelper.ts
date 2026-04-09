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
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
};

const toPositiveNumber = (
  value: unknown,
  fallback: number,
  options?: { min?: number; max?: number }
): number => {
  const single = getSingleValue(value);
  const parsed = Number(single);

  if (!single || Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  let result = Math.floor(parsed);

  if (options?.min !== undefined && result < options.min) {
    result = options.min;
  }

  if (options?.max !== undefined && result > options.max) {
    result = options.max;
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
