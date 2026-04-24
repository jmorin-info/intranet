'use client';

/**
 * Re-export of the dashboard face selector that historically lived under
 * `components/widgets`. The selector itself is a widget preset picker and
 * remains source-of-truth in `widgets/dashboard-face-selector.tsx`; this file
 * exists so the new `components/dashboard/*` boundary is self-contained.
 */

export {
  DashboardFaceSelector,
  DASHBOARD_FACES,
  loadDashboardFace,
  saveDashboardFace,
} from '@/components/widgets/dashboard-face-selector';
export type {
  DashboardFaceId,
  DashboardFaceDef,
} from '@/components/widgets/dashboard-face-selector';
