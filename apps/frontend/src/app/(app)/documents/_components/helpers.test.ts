import { afterEach, describe, expect, it, vi } from 'vitest';
import { getValidityInfo } from './helpers';

describe('Document review dates', () => {
  afterEach(() => vi.useRealTimers());
  it('distinguishes missing or invalid dates from a permanent validity', () => {
    expect(getValidityInfo(null).label).toBe('Échéance non définie');
    expect(getValidityInfo('invalid').label).toBe('Échéance à vérifier');
  });
  it('uses calendar days instead of marking today overdue because of the current time', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T22:40:00Z'));
    expect(getValidityInfo('2026-11-12').label).toBe('À revoir dans 0 j');
    expect(getValidityInfo('2026-11-11').label).toBe('Revue en retard de 1 j');
    expect(getValidityInfo('2026-12-01').label).toBe('Prochaine revue dans 19 j');
  });
});
