import { UserRole } from './enums';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  iat?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  iat?: number;
}
