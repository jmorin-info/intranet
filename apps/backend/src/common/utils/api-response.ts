/**
 * Standardized API response helpers.
 *
 * Use for new endpoints to ensure consistent response shape across the API.
 * Existing controllers should NOT be migrated in bulk — adopt incrementally
 * when touching endpoints for other reasons.
 *
 * Shape:
 *   success: true  -> { success: true, data, message? }
 *   success: false -> { success: false, error: { code, message } }
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { code: string; message: string };
}

export function ok<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, data, ...(message && { message }) };
}

export function fail(code: string, message: string): ApiResponse<never> {
  return { success: false, error: { code, message } };
}
