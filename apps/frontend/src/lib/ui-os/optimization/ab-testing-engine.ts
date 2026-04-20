/**
 * A/B Testing Engine — Internal session-level variant testing.
 *
 * Assigns a variant (A or B) per session. Collects metrics per variant.
 * Decides winner after minimum 20 samples with >= 0.7 confidence.
 *
 * No external service. No analytics dependency. Pure in-memory.
 */

export type Variant = 'A' | 'B';

export interface ABTest {
  id: string;
  name: string;
  paramName: string;
  variantA: number;
  variantB: number;
}

export interface VariantMetrics {
  samples: number;
  totalClicksSaved: number;
  totalTimeSavedMs: number;
  fatigueScoreSum: number;
}

export interface ABTestResult {
  testId: string;
  winnerVariant: Variant | null;
  improvement: number;
  confidence: number;
  ready: boolean;
}

const MIN_SAMPLES = 20;
const MIN_CONFIDENCE = 0.7;

class ABTestingEngine {
  private tests = new Map<string, ABTest>();
  private metrics = new Map<string, Record<Variant, VariantMetrics>>();
  private sessionVariant: Variant;

  constructor() {
    // Assign variant randomly per session
    this.sessionVariant = Math.random() < 0.5 ? 'A' : 'B';
  }

  /** Get this session's variant */
  getVariant(): Variant {
    return this.sessionVariant;
  }

  /** Register a test */
  registerTest(test: ABTest): void {
    this.tests.set(test.id, test);
    if (!this.metrics.has(test.id)) {
      this.metrics.set(test.id, {
        A: { samples: 0, totalClicksSaved: 0, totalTimeSavedMs: 0, fatigueScoreSum: 0 },
        B: { samples: 0, totalClicksSaved: 0, totalTimeSavedMs: 0, fatigueScoreSum: 0 },
      });
    }
  }

  /** Record a data point for the current variant */
  record(testId: string, data: { clicksSaved: number; timeSavedMs: number; fatigueScore: number }): void {
    const m = this.metrics.get(testId);
    if (!m) return;
    const v = m[this.sessionVariant];
    v.samples++;
    v.totalClicksSaved += data.clicksSaved;
    v.totalTimeSavedMs += data.timeSavedMs;
    v.fatigueScoreSum += data.fatigueScore;
  }

  /** Get the parameter value for this session's variant */
  getParamValue(testId: string): number | null {
    const test = this.tests.get(testId);
    if (!test) return null;
    return this.sessionVariant === 'A' ? test.variantA : test.variantB;
  }

  /** Evaluate a test result */
  evaluate(testId: string): ABTestResult {
    const m = this.metrics.get(testId);
    if (!m) return { testId, winnerVariant: null, improvement: 0, confidence: 0, ready: false };

    const totalSamples = m.A.samples + m.B.samples;
    if (totalSamples < MIN_SAMPLES) {
      return { testId, winnerVariant: null, improvement: 0, confidence: 0, ready: false };
    }

    // Compare average clicks saved per sample
    const avgA = m.A.samples > 0 ? m.A.totalClicksSaved / m.A.samples : 0;
    const avgB = m.B.samples > 0 ? m.B.totalClicksSaved / m.B.samples : 0;

    const diff = Math.abs(avgA - avgB);
    const maxAvg = Math.max(avgA, avgB, 0.01);
    const improvement = diff / maxAvg;

    // Simple confidence: proportion of total samples in the winning variant
    const winnerSamples = avgA >= avgB ? m.A.samples : m.B.samples;
    const confidence = winnerSamples / Math.max(totalSamples, 1);

    const winner: Variant = avgA >= avgB ? 'A' : 'B';
    const ready = confidence >= MIN_CONFIDENCE && totalSamples >= MIN_SAMPLES;

    return {
      testId,
      winnerVariant: ready ? winner : null,
      improvement: Math.round(improvement * 100),
      confidence: Math.round(confidence * 100) / 100,
      ready,
    };
  }

  /** Reset all test data */
  reset(): void {
    this.metrics.clear();
    this.sessionVariant = Math.random() < 0.5 ? 'A' : 'B';
  }
}

export const abTestingEngine = new ABTestingEngine();
