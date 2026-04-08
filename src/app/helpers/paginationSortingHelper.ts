export type PaginationOptions = {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
};

type IOptions = {
  page?: number | string;
  limit?: number | string;
  sortBy?: string;
  sortOrder?: string;
};

const MAX_LIMIT = 100;

const paginationSortingHelper = (options: IOptions = {}): PaginationOptions => {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(options.limit) || 10));
  const skip = (page - 1) * limit;

  const sortBy =
    typeof options.sortBy === "string" && options.sortBy.trim().length > 0
      ? options.sortBy.trim()
      : "createdAt";

  const sortOrder: "asc" | "desc" =
    options.sortOrder === "asc" ? "asc" : "desc";

  return { page, limit, skip, sortBy, sortOrder };
};

export default paginationSortingHelper;
