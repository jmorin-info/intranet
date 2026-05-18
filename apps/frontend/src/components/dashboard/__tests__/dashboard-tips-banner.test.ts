import { describe, it, expect, vi, afterEach } from "vitest";

import { pickDailyTip, FALLBACK_DAILY_TIPS } from "../dashboard-tips-banner";

describe("pickDailyTip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retourne une chaîne vide pour une liste vide", () => {
    expect(pickDailyTip([])).toBe("");
  });

  it("retourne le seul élément si la liste contient 1 tip", () => {
    expect(pickDailyTip(["unique"])).toBe("unique");
  });

  it("est stable au sein d'un même jour UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T08:00:00Z"));
    const morning = pickDailyTip(FALLBACK_DAILY_TIPS);
    vi.setSystemTime(new Date("2026-05-18T22:30:00Z"));
    const evening = pickDailyTip(FALLBACK_DAILY_TIPS);
    expect(morning).toBe(evening);
  });

  it("change d'un jour UTC à l'autre", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:00:00Z"));
    const day1 = pickDailyTip(FALLBACK_DAILY_TIPS);
    // tips.length = 41 → on avance d'un nombre de jours non multiple de 41
    vi.setSystemTime(new Date("2026-05-19T12:00:00Z"));
    const day2 = pickDailyTip(FALLBACK_DAILY_TIPS);
    expect(day1).not.toBe(day2);
  });

  it("le fallback contient au moins 40 tips", () => {
    expect(FALLBACK_DAILY_TIPS.length).toBeGreaterThanOrEqual(40);
    FALLBACK_DAILY_TIPS.forEach((tip) => {
      expect(typeof tip).toBe("string");
      expect(tip.length).toBeGreaterThan(0);
    });
  });
});
