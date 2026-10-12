const normalized = (value) => String(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

// Conservative, deterministic scorer; unfamiliar labels/layouts require human review, not an AI judge.
export function score(fixture, plan, records) {
  const mapping = Object.fromEntries(
    fixture.fields.map((f) => {
      const matches = plan.fields.map((p, i) => (f.names.test(`${p.key} ${p.label}`) ? i : -1)).filter((i) => i >= 0);
      return [f.key, matches.length === 1 ? matches[0] : -1];
    }),
  );
  // Schema is proposed freely: an exact time range carries the same two facts as
  // separate start/end columns. No timezone conversion or date/time guessing.
  const rangeColumns = plan.fields
    .map((f, i) =>
      /^(?:time|time_range|time_slot|时间|时间段|时间范围)$/i.test(f.key) || /^(?:时间|时间段|时间范围)$/.test(f.label)
        ? i
        : -1,
    )
    .filter((i) => i >= 0);
  const rangeIndex = rangeColumns.length === 1 ? rangeColumns[0] : -1;
  const equivalentCell = (record, key) => {
    const direct = record.cells[mapping[key]];
    if (direct || !['start', 'end'].includes(key) || rangeIndex < 0) return direct;
    const range = record.cells[rangeIndex];
    const parts = /^(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})$/.exec(range?.originalValue || '');
    if (!parts || parts.slice(1).some((v) => Number(v.slice(0, 2)) > 23 || Number(v.slice(3)) > 59)) return undefined;
    return { ...range, originalValue: parts[key === 'start' ? 1 : 2] };
  };
  const issues = [];
  const used = new Set();
  let matched = 0;
  let correct = 0;
  for (const expected of fixture.rows) {
    const identity = normalized(expected[fixture.identity]);
    const candidates = records
      .map((r, i) => (normalized(r.cells[mapping[fixture.identity]]?.originalValue ?? '') === identity ? i : -1))
      .filter((i) => i >= 0);
    if (candidates.length !== 1) {
      issues.push({
        record: expected[fixture.identity],
        reason: candidates.length ? 'duplicate_record' : 'missing_or_unmapped_record',
      });
      continue;
    }
    const index = candidates[0];
    matched++;
    used.add(index);
    for (const f of fixture.fields) {
      const actual = equivalentCell(records[index], f.key);
      const wanted = expected[f.key];
      let ok = false;
      if (actual && wanted && typeof wanted === 'object' && !Array.isArray(wanted)) {
        ok = actual.status === wanted.status && (wanted.contains || []).every((v) => actual.originalValue.includes(v));
      } else if (actual?.status === 'found') {
        const accepted = Array.isArray(wanted) ? wanted : [wanted];
        ok = accepted.some((v) => normalized(v) === normalized(actual.originalValue));
      }
      if (ok) correct++;
      else
        issues.push({
          record: expected[fixture.identity],
          field: f.key,
          expected: wanted,
          actual: actual ? { value: actual.originalValue, status: actual.status } : null,
          reason: mapping[f.key] < 0 ? 'unmapped_field_requires_review' : 'cell_mismatch',
        });
    }
  }
  records.forEach((record, i) => {
    if (!used.has(i)) issues.push({ reason: 'unexpected_or_duplicate_record', recordId: record.id });
  });
  return {
    expectedRecords: fixture.rows.length,
    extractedRecords: records.length,
    matchedRecords: matched,
    recordRecall: matched / fixture.rows.length,
    recordPrecision: records.length ? matched / records.length : 0,
    expectedCells: fixture.rows.length * fixture.fields.length,
    correctCells: correct,
    fieldMapping: Object.fromEntries(
      Object.entries(mapping).map(([key, i]) => [
        key,
        plan.fields[i]?.label ??
          (['start', 'end'].includes(key) && rangeIndex >= 0 ? `${plan.fields[rangeIndex].label} (${key})` : null),
      ]),
    ),
    planIssues: plan.issues || [],
    evidenceIssueCells: records.flatMap((r) => r.cells).filter((c) => c.evidenceIssues?.length).length,
    issues,
  };
}
