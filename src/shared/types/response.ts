// Plain, client-shareable response contracts (no server-only). The response DTO
// is the inner `data` - the HTTP path wraps it in this envelope.

export interface ApiResponse<T> {
  message: string;
  data: T;
}

export interface CursorMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  meta: CursorMeta;
}

/**
 * Error envelope shape.
 * @public
 */
export interface ApiError {
  message: string;
  error?: string | null;
  errors?: unknown;
}
