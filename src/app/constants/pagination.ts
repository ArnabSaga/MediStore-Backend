export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 10,
  SORT_BY: "createdAt",
  SORT_ORDER: "desc",
} as const;

export const PAGINATION_FIELDS = ["page", "limit", "sortBy", "sortOrder", "searchTerm"];
