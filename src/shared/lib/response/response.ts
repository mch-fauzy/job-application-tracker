import type { ApiResponse, CursorMeta, PaginatedData } from '@/shared/types/response';

// Builds the success envelope for a single resource.
export function ok<T>(data: T, message: string): ApiResponse<T> {
  return { message, data };
}

// Builds the success envelope for a keyset-paginated list.
export function paginated<T>(
  items: T[],
  meta: CursorMeta,
  message: string,
): ApiResponse<PaginatedData<T>> {
  return { message, data: { items, meta } };
}
