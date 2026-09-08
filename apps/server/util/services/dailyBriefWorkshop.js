import { createHash } from 'node:crypto';

export const WORKSHOP_BRIEF_DEFINITIONS = Object.freeze([
  ['workshop_result', '值得查看的新成果', 'New workshop result'],
  ['workshop_next_step', '项目下一步', 'Project next step'],
  ['workshop_due', '临近目标日期', 'Upcoming project target'],
]);
const json = (value) => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};
const clean = (value) =>
  String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
export async function compileWorkshopBriefFacts(database, userId, calendar) {
  const [results] = await database.query(
    `SELECT a.id, a.job_id, a.title, a.artifact_version, LEFT(a.content, 3000) AS content, a.coverage_json
    FROM toolbox_artifacts a JOIN toolbox_jobs j ON j.id = a.job_id AND j.user_id = a.user_id
    WHERE a.user_id = ? AND a.status = 'ready' AND a.expires_at > NOW() AND j.save_status = 'unsaved'
      AND j.status IN ('succeeded','partial_succeeded') AND a.create_time >= ?
      AND a.tool_id IN ('material_to_note','research_brief','source_comparison','study_kit','concept_map')
    ORDER BY a.create_time DESC LIMIT 5`,
    [userId, calendar.yesterdayStart],
  );
  const [projects] = await database.query(
    `SELECT w.id,w.kind,w.title,w.next_step,DATE_FORMAT(w.target_date, '%Y-%m-%d') AS target_date,w.updated_at,
      (SELECT COUNT(*) FROM toolbox_workspace_items i WHERE i.workspace_id = w.id AND i.user_id = w.user_id AND i.status IN ('open','in_progress')) AS pending
    FROM toolbox_workspaces w WHERE w.user_id = ? AND w.status = 'active'
      AND (w.updated_at >= ? OR (w.target_date >= ? AND w.target_date < DATE_ADD(?, INTERVAL 8 DAY)))
    ORDER BY w.target_date IS NULL, w.target_date, w.updated_at DESC LIMIT 20`,
    [userId, calendar.yesterdayStart, calendar.date, calendar.date],
  );
  const result = results
    .map((row) => {
      let inConclusion = false;
      const conclusion = String(row.content || '')
        .split('\n')
        .map(clean)
        .find((line) => {
          if (/^#{1,3}\s/u.test(line)) {
            inConclusion = /结论|摘要|总结|summary|conclusion/iu.test(line);
            return false;
          }
          return inConclusion && line.length >= 24 && !/^(>|```|\|)/u.test(line);
        });
      if (!conclusion) return null;
      const partial = json(row.coverage_json)?.complete !== true;
      return {
        row,
        sample:
          `${partial ? (calendar.locale === 'en-US' ? 'Partial sources: ' : '资料未完整读取：') : ''}${conclusion}`.slice(
            0,
            120,
          ),
      };
    })
    .find(Boolean);
  const dueThrough = new Date(Date.parse(`${calendar.date}T00:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  const due = projects.find(
    (row) =>
      row.target_date &&
      Number(row.pending) > 0 &&
      String(row.target_date).slice(0, 10) >= calendar.date &&
      String(row.target_date).slice(0, 10) <= dueThrough,
  );
  const next = projects.find((row) => row.id !== due?.id && clean(row.next_step));
  const candidates = [result, next, due];
  return WORKSHOP_BRIEF_DEFINITIONS.map(([id, zh, en], index) => {
    const candidate = candidates[index];
    const row = index === 0 ? candidate?.row : candidate;
    const source = row
      ? {
          type: index === 0 ? 'toolbox_task' : `${row.kind}_workspace`,
          id: String(index === 0 ? row.job_id : row.id),
          title: clean(row.title).slice(0, 120),
        }
      : null;
    const route = source
      ? index === 0
        ? `/toolbox/task/${encodeURIComponent(source.id)}`
        : `/toolbox/${source.type}?workspace=${encodeURIComponent(source.id)}`
      : '/toolbox';
    const sample = !row
      ? ''
      : index === 0
        ? candidate.sample
        : index === 1
          ? `${clean(row.title)}：${clean(row.next_step)}`.slice(0, 120)
          : `${clean(row.title)} · ${String(row.target_date).slice(0, 10)}`.slice(0, 120);
    return {
      id,
      label: calendar.locale === 'en-US' ? en : zh,
      route,
      count: row ? 1 : 0,
      samples: sample ? [sample] : [],
      sources: source ? [source] : [],
      revision: row
        ? createHash('sha256')
            .update(JSON.stringify([row.id, row.artifact_version, sample]))
            .digest('hex')
        : '',
    };
  });
}
