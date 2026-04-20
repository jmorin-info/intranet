/**
 * UX Insight — Actionable recommendation derived from friction signals.
 */

export interface UXInsight {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  type: 'FRICTION' | 'CONFUSION' | 'INEFFICIENCY' | 'REDUNDANCY' | 'OVERLOAD' | 'DISCOVERY_ISSUE';
  module: 'TICKETS' | 'DOCUMENTS' | 'INCIDENTS' | 'DASHBOARD';
  description: string;
  recommendation: string;
  confidence: number;
  metrics: {
    clicks?: number;
    scrollDepth?: number;
    timeToAction?: number;
    rollbacks?: number;
    loops?: number;
  };
}
