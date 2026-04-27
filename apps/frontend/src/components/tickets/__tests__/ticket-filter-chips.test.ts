import { describe, it, expect } from "vitest";
import {
  applyTicketChipFilters,
  type TicketLite,
  type TicketFilterChipId,
} from "../ticket-filter-chips";

const NOW = new Date("2026-04-26T12:00:00Z");

const tickets: TicketLite[] = [
  // Mine, OPEN, MEDIUM, today
  {
    id: "t1",
    status: "OPEN",
    priority: "MEDIUM",
    assigneeId: "u1",
    createdAt: "2026-04-26T08:00:00Z",
    mentionedUserIds: [],
  },
  // Not mine, OPEN, CRITICAL, 6h ago → SLA exceeded
  {
    id: "t2",
    status: "OPEN",
    priority: "CRITICAL",
    assigneeId: "u2",
    createdAt: "2026-04-26T06:00:00Z",
    mentionedUserIds: ["u1"],
  },
  // Mine, RESOLVED, HIGH, 6h ago → SLA but resolved (excluded)
  {
    id: "t3",
    status: "RESOLVED",
    priority: "HIGH",
    assigneeId: "u1",
    createdAt: "2026-04-26T06:00:00Z",
    mentionedUserIds: [],
  },
  // Last week, MEDIUM
  {
    id: "t4",
    status: "OPEN",
    priority: "MEDIUM",
    assigneeId: "u3",
    createdAt: "2026-04-15T10:00:00Z",
    mentionedUserIds: [],
  },
];

function s(...ids: TicketFilterChipId[]): Set<TicketFilterChipId> {
  return new Set(ids);
}

describe("applyTicketChipFilters", () => {
  it("returns all tickets when no chip is active", () => {
    expect(
      applyTicketChipFilters(tickets, {
        active: new Set(),
        currentUserId: "u1",
        now: NOW,
      }),
    ).toEqual(tickets);
  });

  it('filters "mine" by assigneeId', () => {
    const result = applyTicketChipFilters(tickets, {
      active: s("mine"),
      currentUserId: "u1",
      now: NOW,
    });
    expect(result.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it('filters "mentions" by mentionedUserIds', () => {
    const result = applyTicketChipFilters(tickets, {
      active: s("mentions"),
      currentUserId: "u1",
      now: NOW,
    });
    expect(result.map((t) => t.id)).toEqual(["t2"]);
  });

  it('returns empty when "mine" but no current user', () => {
    expect(
      applyTicketChipFilters(tickets, {
        active: s("mine"),
        currentUserId: null,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it('filters "sla-exceeded" — only HIGH/CRITICAL OPEN/IN_PROGRESS > 4h', () => {
    const result = applyTicketChipFilters(tickets, {
      active: s("sla-exceeded"),
      currentUserId: "u1",
      now: NOW,
    });
    // Only t2 matches: CRITICAL, OPEN, 6h ago
    expect(result.map((t) => t.id)).toEqual(["t2"]);
  });

  it("combines chips with AND", () => {
    const result = applyTicketChipFilters(tickets, {
      active: s("mine", "today"),
      currentUserId: "u1",
      now: NOW,
    });
    // Mine = t1, t3 ; today = t1, t2, t3 (all created 2026-04-26 UTC) ;
    // intersection = t1, t3
    expect(result.map((t) => t.id).sort()).toEqual(["t1", "t3"]);
  });

  it('filters "today" — only today date range', () => {
    const result = applyTicketChipFilters(tickets, {
      active: s("today"),
      currentUserId: "u1",
      now: NOW,
    });
    // Tickets created 2026-04-26 = t1, t2, t3 (all in UTC same day)
    expect(result.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it('filters "week" — current ISO week (Mon-Sun)', () => {
    // 2026-04-26 is a Sunday. Week = Mon 2026-04-20 -> Mon 2026-04-27.
    // t4 = 2026-04-15 (previous week) → excluded
    const result = applyTicketChipFilters(tickets, {
      active: s("week"),
      currentUserId: "u1",
      now: NOW,
    });
    expect(result.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
  });
});
