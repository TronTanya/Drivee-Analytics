/** Standard error envelope from backend (optional — parse when present). */
export type ApiErrorDto = {
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
};

export type PaginatedDto<T> = {
  items: T[];
  next_cursor?: string | null;
  total?: number;
};

export type IdResponse = { id: string };
