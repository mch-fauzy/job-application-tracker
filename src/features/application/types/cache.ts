import type { PaginatedInfiniteCache } from '@/shared/lib/infinite-cache/infinite-cache';
import type { ApplicationResponse } from '../dtos/v1/responses/application';

// The cached pages of one application list query: a board column or the archived list.
export type ApplicationListCache = PaginatedInfiniteCache<ApplicationResponse>;
