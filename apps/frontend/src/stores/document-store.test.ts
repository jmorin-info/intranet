import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentStatus } from '@omnitech/shared';
import { useDocumentStore } from './document-store';

describe('Document filters', () => {
  beforeEach(() => useDocumentStore.getState().resetFilters());
  it('replaces a specific status with a complete server status family', () => {
    useDocumentStore.getState().setFilters({ status: DocumentStatus.DRAFT, search: 'politique' });
    useDocumentStore.getState().setFilters({ statusGroup: 'review', page: 1 });
    expect(useDocumentStore.getState().filters).toMatchObject({ status: undefined, statusGroup: 'review', search: 'politique', page: 1 });
    useDocumentStore.getState().setFilters({ status: DocumentStatus.APPROVED });
    expect(useDocumentStore.getState().filters.statusGroup).toBeUndefined();
  });
  it('resets all persisted criteria and pagination', () => {
    useDocumentStore.getState().setFilters({ page: 4, search: 'test', statusGroup: 'archived', dateTo: '2026-11-12' });
    useDocumentStore.getState().resetFilters();
    expect(useDocumentStore.getState().filters).toEqual({ page: 1, limit: 20, sortBy: 'updatedAt', sortOrder: 'desc' });
  });
});
