import { DocumentStatus, DocumentCategory, UserRole, AuditSeverity } from './enums';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PaginatedRequest {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DocumentFilters {
  status?: DocumentStatus;
  category?: DocumentCategory;
  isoControlCode?: string;
  ownerId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  severity?: AuditSeverity;
}

export interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  departmentId?: string;
  departmentName?: string;
  avatarUrl?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface DocumentReference {
  prefix: string;
  categoryCode: string;
  domainCode: string;
  sequenceNumber: number;
}
