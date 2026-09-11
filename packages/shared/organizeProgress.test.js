import { describe, expect, it } from "vitest";
import {
  organizeObjectOutcome,
  organizeOutcomeGroup,
  summarizeOrganizeLane,
  organizeOverviewStatus,
  summarizeOrganizeOutcomes,
} from "./organizeProgress.js";
describe("organize progress", () => {
  it("counts objects once and waits for every operation on that object", () => {
    const result = summarizeOrganizeLane(
      [
        { itemId: "a", status: "completed" },
        { itemId: "a", status: "waiting" },
        { itemId: "b", status: "completed" },
        { itemId: "b", status: "failed" },
        { itemId: "c", status: "completed" },
        { itemId: null, status: "running" },
      ],
      false,
    );
    expect(result).toMatchObject({
      total: 3,
      completed: 1,
      waiting: 1,
      partial: 1,
      settled: false,
    });
  });
  it("keeps partial, failure, skipped and cancelled outcomes distinct", () => {
    const result = summarizeOrganizeLane(
      ["partial", "failed", "conflict", "skipped", "cancelled"].map(
        (status, i) => ({ itemId: String(i), status }),
      ),
      true,
    );
    expect(result).toMatchObject({
      partial: 1,
      failed: 2,
      skipped: 1,
      cancelled: 1,
      completed: 0,
    });
  });
  it("AI pause is not a whole-run pause while free work remains", () => {
    const lane = summarizeOrganizeLane([], true);
    const overview = { inspection: { settled: false }, direct: lane, ai: lane };
    expect(organizeOverviewStatus(overview, "paused")).toBe("aiPausedWorking");
    overview.inspection.settled = true;
    overview.direct.waiting = 1;
    expect(organizeOverviewStatus(overview, "paused")).toBe("aiPausedWorking");
    overview.direct.waiting = 0;
    expect(organizeOverviewStatus(overview, "paused")).toBe("paused");
    overview.direct.partial = 1;
    expect(organizeOverviewStatus(overview, "completed")).toBe(
      "partialFailure",
    );
    expect(organizeOverviewStatus(overview, "ended")).toBe("ended");
  });
});

describe("whole-run object outcomes", () => {
  it("reconciles the scope without counting multiple suggestions or both processing lanes twice", () => {
    const base = {
      rule_status: "completed",
      ai_status: "not_needed",
      resource_available: 1,
    };
    const rows = [
      { ...base, pending: 1, failed: 1, manual: 1 },
      { ...base, manual: 1 },
      { ...base, ai_status: "running", work_open: 1 },
      { ...base, work_failed: 1 },
      { ...base, reviewed: 1 },
      base,
      { ...base, rule_status: "skipped" },
      { ...base, resource_available: 0, pending: 1 },
    ];
    const result = summarizeOrganizeOutcomes(rows, "running");
    expect(result).toEqual({
      review: 1,
      manual: 1,
      processing: 1,
      unfinished: 1,
      reviewed: 1,
      unchanged: 1,
      skipped: 1,
      unavailable: 1,
    });
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });
  it("never treats unchecked legacy objects as clean or cancelled work as still processing", () => {
    const result = summarizeOrganizeOutcomes(
      [
        {
          resource_available: 1,
          rule_status: "pending",
          ai_status: "not_needed",
        },
        {
          resource_available: 1,
          rule_status: "completed",
          ai_status: "queued",
        },
      ],
      "ended",
      2,
    );
    expect(result.unfinished).toBe(2);
    expect(result.unchanged).toBe(0);
    expect(result.processing).toBe(0);
  });
});

it("keeps unfinished matching out of manual totals and groups", () => {
  const base = {
    resource_available: 1,
    rule_status: "completed",
    ai_status: "completed",
  };
  const rows = [
    ...Array.from({ length: 3 }, () => ({ ...base, pending: 1 })),
    ...Array.from({ length: 2 }, () => ({ ...base, manual: 1 })),
    ...Array.from({ length: 5 }, () => ({ ...base, manual: 1, work_open: 1 })),
  ];
  const outcomes = summarizeOrganizeOutcomes(rows, "completed");
  expect(outcomes).toMatchObject({ review: 3, manual: 2, unfinished: 5 });
  const groups = rows.map((row) =>
    organizeOutcomeGroup(organizeObjectOutcome(row, "completed")),
  );
  expect(groups.filter((group) => group === "manual")).toHaveLength(2);
  expect(groups.filter((group) => group === "analysis")).toHaveLength(5);
  const lane = summarizeOrganizeLane([], true);
  expect(
    organizeOverviewStatus(
      {
        inspection: { settled: true },
        direct: lane,
        ai: lane,
        review: { outcomes },
      },
      "completed",
    ),
  ).toBe("partialFailure");
});
