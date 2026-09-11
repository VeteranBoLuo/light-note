// A resource may have work in both lanes; each lane counts it once.
export const ORGANIZE_TERMINAL_STATES = [
  "completed",
  "partial",
  "failed",
  "conflict",
  "cancelled",
  "skipped",
];
export function summarizeOrganizeLane(rows, settled = false) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.itemId) continue;
    const states = groups.get(row.itemId) || [];
    states.push(row.status);
    groups.set(row.itemId, states);
  }
  const result = {
    total: groups.size,
    completed: 0,
    partial: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    running: 0,
    waiting: 0,
    queued: 0,
    settled,
  };
  for (const states of groups.values()) {
    const state = states.includes("running")
      ? "running"
      : states.includes("queued")
        ? "queued"
        : states.includes("waiting")
          ? "waiting"
          : states.includes("partial") ||
              (states.includes("completed") &&
                states.some((s) =>
                  ["failed", "conflict", "cancelled"].includes(s),
                ))
            ? "partial"
            : states.some((s) => ["failed", "conflict"].includes(s))
              ? "failed"
              : states.includes("cancelled")
                ? "cancelled"
                : states.every((s) => s === "skipped")
                  ? "skipped"
                  : "completed";
    result[state]++;
  }
  return result;
}
export function organizeOverviewStatus(overview, status) {
  if (status === "ended" || status === "cancelled") return "ended";
  const directBusy =
    !overview.inspection.settled ||
    overview.direct.running + overview.direct.queued + overview.direct.waiting >
      0;
  if (status === "paused")
    return directBusy || overview.ai.running > 0 ? "aiPausedWorking" : "paused";
  if (status === "completed")
    return (overview.review?.outcomes?.unfinished || 0) +
      overview.direct.failed +
      overview.direct.partial +
      overview.ai.failed +
      overview.ai.partial >
      0
      ? "partialFailure"
      : "completed";
  if (status === "failed") return "partialFailure";
  return "running";
}

// A single primary result per object makes the frozen scope reconcilable.
// Reviewable work takes priority over unresolved secondary checks.
export function summarizeOrganizeOutcomes(rows, runStatus, runVersion = 3) {
  const counts = {
    review: 0,
    manual: 0,
    processing: 0,
    unfinished: 0,
    reviewed: 0,
    unchanged: 0,
    skipped: 0,
    unavailable: 0,
  };
  for (const row of rows) {
    const bucket = organizeObjectOutcome(row, runStatus, runVersion);
    counts[bucket]++;
  }
  return counts;
}

export function organizeObjectOutcome(row, runStatus, runVersion = 3) {
  const ended = ["completed", "ended", "cancelled", "failed"].includes(
    runStatus,
  );
  const yes = (key) => Number(row[key]) > 0;
  const active =
    yes("work_open") ||
    ["queued", "running", "waiting_content", "preparing_content"].includes(
      row.ai_status,
    );
  let bucket;
  if (row.rule_status === "removed") bucket = "reviewed";
  else if (!yes("resource_available")) bucket = "unavailable";
  else if (yes("pending")) bucket = "review";
  else if (yes("expired")) bucket = "unavailable";
  else if (active || yes("pending_work"))
    bucket = ended ? "unfinished" : "processing";
  else if (
    yes("work_failed") ||
    yes("failed") ||
    ["failed", "conflict", "cancelled"].includes(row.ai_status)
  )
    bucket = "unfinished";
  else if (yes("manual") || yes("unsupported")) bucket = "manual";
  else if (yes("reviewed")) bucket = "reviewed";
  else if (row.rule_status === "skipped") bucket = "skipped";
  else if (
    row.rule_status === "completed" ||
    (runVersion === 1 && runStatus === "completed")
  )
    bucket = "unchanged";
  else bucket = ended ? "unfinished" : "processing";
  return bucket;
}

export function organizeOutcomeGroup(outcome) {
  return {
    review: "priority",
    manual: "manual",
    processing: "analysis",
    unfinished: "analysis",
    reviewed: "reviewed",
    unchanged: "clear",
    skipped: "analysis",
    unavailable: "expired",
  }[outcome];
}
