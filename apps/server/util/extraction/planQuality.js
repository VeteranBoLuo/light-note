const normalize = (text) =>
  String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
const metadata =
  /^(?:sourcepage|sourceversion|evidence|readability|coverage|conflictnote|sourceid|来源页|来源版本|原文依据|可读性|读取覆盖|冲突说明)$/;
const sameConcept = [['room', 'location', 'venue', '房间', '地点', '会场', '会议室']];

// These are review warnings, not silent deletion: "room" and "location" can be
// distinct in another document. The UI must let the user confirm the suggested plan.
export function planIssues(fields) {
  const names = fields.map((f) => [normalize(f.key), normalize(f.label)]);
  const issues = [];
  names.forEach((values, i) => {
    if (values.some((v) => metadata.test(v))) issues.push({ code: 'system_metadata_field', fields: [fields[i].id] });
  });
  for (const synonyms of sameConcept) {
    const selected = names
      .map((values, i) => (values.some((v) => synonyms.includes(v)) ? i : -1))
      .filter((i) => i >= 0);
    if (selected.length > 1)
      issues.push({ code: 'possibly_redundant_fields', fields: selected.map((i) => fields[i].id) });
  }
  const has = (regex) => names.flatMap((values, i) => (values.some((v) => regex.test(v)) ? [i] : []));
  const range = has(/^(?:timerange|timeslot|时间段|时间范围)$/);
  const start = has(/^(?:starttime|开始时间)$/);
  const end = has(/^(?:endtime|结束时间)$/);
  if (range.length && start.length && end.length)
    issues.push({ code: 'redundant_time_range', fields: [...range, ...start, ...end].map((i) => fields[i].id) });
  return issues;
}
