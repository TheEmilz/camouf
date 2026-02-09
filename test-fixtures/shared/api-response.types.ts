/**
 * Shared API Response types - canonical schema
 * 
 * These types define the standard API response format.
 * Field names like "data", "message", "meta", "status", "limit"
 * are common and can easily cause false positives when matched
 * against local variable field access (e.g. node.data, event.metaKey).
 */

export interface APIResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string;
  meta: ResponseMeta;
  errors?: APIError[];
}

export interface ResponseMeta {
  page: number;
  limit: number;
  total: number;
  timestamp: string;
}

export interface APIError {
  code: string;
  field: string;
  details: string;
}

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  dataKey: string;
  category: string;
}
