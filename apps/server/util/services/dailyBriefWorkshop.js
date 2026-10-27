import { taskVisibleSql, taskIdentity, hydrateTaskIdentities } from '../toolbox/taskIdentity.js';
import { createHash } from 'node:crypto';
import { boardTodoJoin, boardOpenSql, boardDueSql } from '../toolbox/itemDetails.js';

export const WORKSHOP_BRIEF_DEFINITIONS = Object.freeze([
  ['workshop_result', '值得查看的新成果', 'New workshop result'],
  ['workshop_next_step', '项目下一步', 'Project next step'],
  ['workshop_due', '项目到期提醒', 'Project due dates'],
]);
const clean = (value) =>
  String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
export async function compileWorkshopBriefFacts(database, userId, calendar, { projectIds = null } = {}) {
  const [results] = await database.query(
    `SELECT a.id, a.job_id, a.title, a.artifact_version
    FROM toolbox_artifacts a JOIN toolbox_jobs j ON j.id = a.job_id AND j.user_id = a.user_id
    WHERE a.user_id = ? AND a.status = 'ready' AND a.expires_at > NOW() AND j.save_status = 'unsaved'
      AND j.status IN ('succeeded','partial_succeeded') AND ${taskVisibleSql('j')}
      AND a.tool_id IN ('material_to_note','research_brief','source_comparison','study_kit','concept_map')
    ORDER BY a.create_time DESC LIMIT 5`,
    [userId],
  );
  const [projects] = await database.query(
    `SELECT w.id,w.kind,w.title,w.next_step,w.board_version,DATE_FORMAT(w.target_date, '%Y-%m-%d') AS target_date,
      (SELECT COUNT(*) FROM toolbox_workspace_items i ${boardTodoJoin('i')} WHERE i.workspace_id=w.id AND i.user_id=w.user_id
        AND ${boardOpenSql('i')}) AS pending,
      (SELECT DATE_FORMAT(${boardDueSql('i')}, '%Y-%m-%d') FROM toolbox_workspace_items i ${boardTodoJoin('i')}
        WHERE i.workspace_id=w.id AND i.user_id=w.user_id AND i.lane='action'
          AND ${boardOpenSql('i')} AND ${boardDueSql('i')} < DATE_ADD(?, INTERVAL 8 DAY)
        ORDER BY (${boardDueSql('i')} = ?) DESC, ${boardDueSql('i')}, i.id LIMIT 1) AS action_date,
      (SELECT i.title FROM toolbox_workspace_items i ${boardTodoJoin('i')}
        WHERE i.workspace_id=w.id AND i.user_id=w.user_id AND i.lane='action'
          AND ${boardOpenSql('i')} AND ${boardDueSql('i')} < DATE_ADD(?, INTERVAL 8 DAY)
        ORDER BY (${boardDueSql('i')} = ?) DESC, ${boardDueSql('i')}, i.id LIMIT 1) AS action_title
    FROM toolbox_workspaces w WHERE w.user_id = ? AND w.status = 'active'
      AND EXISTS (SELECT 1 FROM toolbox_workspace_items p ${boardTodoJoin('p')} WHERE p.workspace_id=w.id AND p.user_id=w.user_id AND ${boardOpenSql('p')})
      ${projectIds ? 'AND w.id IN (?)' : ''}
      AND (TRIM(COALESCE(w.next_step,'')) <> '' OR w.updated_at >= ? OR w.target_date < DATE_ADD(?, INTERVAL 8 DAY)
        OR EXISTS (SELECT 1 FROM toolbox_workspace_items i ${boardTodoJoin('i')} WHERE i.workspace_id=w.id AND i.user_id=w.user_id
          AND i.lane='action' AND ${boardOpenSql('i')} AND ${boardDueSql('i')} < DATE_ADD(?, INTERVAL 8 DAY)))
    ORDER BY ((w.target_date = ? AND EXISTS (SELECT 1 FROM toolbox_workspace_items p ${boardTodoJoin('p')} WHERE p.workspace_id=w.id AND p.user_id=w.user_id AND ${boardOpenSql('p')})) OR EXISTS (SELECT 1 FROM toolbox_workspace_items i ${boardTodoJoin('i')}
        WHERE i.workspace_id=w.id AND i.user_id=w.user_id AND i.lane='action'
          AND ${boardOpenSql('i')} AND ${boardDueSql('i')} = ?)) DESC,
      w.target_date IS NULL, w.target_date, w.updated_at DESC, w.id LIMIT 20`,
    [
      calendar.date,
      calendar.date,
      calendar.date,
      calendar.date,
      userId,
      ...(projectIds ? [projectIds.length ? projectIds : ['']] : []),
      calendar.yesterdayStart,
      calendar.date,
      calendar.date,
      calendar.date,
      calendar.date,
    ],
  );
  const [attention] = await database.query(
    `SELECT j.id,j.tool_id,j.status,j.save_status,j.updated_at,j.options_json,
      COALESCE(a.title,JSON_UNQUOTE(JSON_EXTRACT(j.options_json,'$.title')),'') AS title
    FROM toolbox_jobs j LEFT JOIN toolbox_artifacts a ON a.id=j.artifact_id AND a.user_id=j.user_id
    WHERE j.user_id=? AND j.tool_id<>'translation'
      AND (j.status='failed' OR j.save_status='save_failed')
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(j.options_json,'$.homeDismissed')),'false') NOT IN ('true','1')
    ORDER BY j.updated_at DESC,j.id DESC LIMIT 1`,
    [userId],
  );
  const result = results[0]
    ? {
        row: results[0],
        sample:
          calendar.locale === 'en-US'
            ? 'A workshop result is ready and has not been saved.'
            : '工坊成果已生成，尚未保存。',
      }
    : null;
  const due = selectWorkshopDue(projects, calendar.date);
  const next = projects.find(
    (row) => row.id !== due?.id && Number(row.pending) > 0 && /\p{L}/u.test(clean(row.next_step)),
  );
  const candidates = [result, next, due];
  const facts = WORKSHOP_BRIEF_DEFINITIONS.map(([id, zh, en], index) => {
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
          : `${clean(row.title).slice(0, 45)} · ${calendar.locale === 'en-US' ? { today: 'Due today', overdue: 'Overdue', upcoming: 'Upcoming' }[row.urgency] : { today: '今天到期', overdue: '已逾期', upcoming: '即将到期' }[row.urgency]} · ${row.dueDate}${row.actionTitle ? ` · ${clean(row.actionTitle).slice(0, 35)}` : ''}`.slice(
              0,
              120,
            );
    return {
      id,
      label: calendar.locale === 'en-US' ? en : zh,
      route,
      count: row ? 1 : 0,
      samples: sample ? [sample] : [],
      sources: source ? [source] : [],
      ...(index === 2 && row ? { urgency: row.urgency, dueDate: row.dueDate } : {}),
      ...(index !== 0 && row ? { pendingCount: Number(row.pending) || 0 } : {}),
      revision: row
        ? createHash('sha256')
            .update(JSON.stringify([row.id, row.artifact_version, row.board_version, row.pending, sample]))
            .digest('hex')
        : '',
    };
  });
  const failed = (await hydrateTaskIdentities(database, userId, attention))[0];
  const identity = failed ? taskIdentity(failed) : null;
  const fallback =
    calendar.locale === 'en-US'
      ? 'Workshop task'
      : {
          material_to_note: '资料转笔记',
          research_brief: '研究简报',
          source_comparison: '多资料对照',
          study_kit: '学习套件',
          concept_map: '概念图谱',
          idea_to_draft: '灵感成稿',
          ocr_to_text: '文字识别',
        }[failed?.tool_id] || '工坊任务';
  const title = clean(
    identity?.title ||
      (failed
        ? `${fallback} · ${String(failed.updated_at instanceof Date ? failed.updated_at.toISOString() : failed.updated_at || '').slice(0, 10)}`
        : ''),
  ).slice(0, 80);
  const reason = failed
    ? calendar.locale === 'en-US'
      ? failed.save_status === 'save_failed'
        ? 'Result could not be saved'
        : 'Workshop task failed'
      : failed.save_status === 'save_failed'
        ? '工坊成果保存失败'
        : '工坊任务处理失败'
    : '';
  facts.push({
    id: 'workshop_attention',
    label: calendar.locale === 'en-US' ? 'Workshop task to check' : '需要查看的工坊任务',
    route: failed ? `/toolbox/task/${encodeURIComponent(failed.id)}` : '/toolbox',
    count: failed ? 1 : 0,
    samples: failed ? [`${reason}${title ? `${calendar.locale === 'en-US' ? ': ' : '：'}${title}` : ''}`] : [],
    sources: failed ? [{ type: 'toolbox_task', id: String(failed.id), title: title || reason }] : [],
    revision: failed
      ? createHash('sha256')
          .update(JSON.stringify([failed.id, failed.status, failed.save_status, failed.updated_at, title]))
          .digest('hex')
      : '',
  });
  return facts;
}

/** Prefer today's actionable project, then overdue, then the nearest upcoming date. */
export function selectWorkshopDue(projects, today) {
  const through = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const rank = (date) => (date === today ? 0 : date < today ? 1 : 2);
  return projects
    .filter((row) => !row.status || row.status === 'active')
    .flatMap((row) => {
      const dates = [
        ...(Number(row.pending) > 0 && row.target_date ? [{ date: String(row.target_date).slice(0, 10) }] : []),
        ...(row.action_date ? [{ date: String(row.action_date).slice(0, 10), title: row.action_title }] : []),
      ]
        .filter(({ date }) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= through)
        .sort(
          (a, b) =>
            rank(a.date) - rank(b.date) ||
            a.date.localeCompare(b.date) ||
            Number(Boolean(b.title)) - Number(Boolean(a.title)),
        );
      if (!dates.length) return [];
      const chosen = dates[0];
      return [
        {
          ...row,
          dueDate: chosen.date,
          actionTitle: chosen.title,
          urgency: chosen.date === today ? 'today' : chosen.date < today ? 'overdue' : 'upcoming',
        },
      ];
    })
    .sort(
      (a, b) =>
        rank(a.dueDate) - rank(b.dueDate) ||
        a.dueDate.localeCompare(b.dueDate) ||
        String(a.id).localeCompare(String(b.id)),
    )[0];
}
