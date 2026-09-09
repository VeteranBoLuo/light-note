import { Temporal } from '@js-temporal/polyfill';
import { assertVisitorOwner, parseExampleManifest, visitorDate, offsetDate } from './visitorExampleScheduleService.js';
import { compileWorkshopBriefFacts } from './dailyBriefWorkshop.js';
import { summarizeUntaggedResources } from './resourceInventoryService.js';
import { queryPendingCount } from '../resourceInbox.js';

export async function getVisitorBrief(db, { userId, locale = 'zh-CN', now = new Date() }) {
  await assertVisitorOwner(db, userId);
  const [[state]] = await db.query(
    "SELECT version,manifest_json,DATE_FORMAT(last_success_date,'%Y-%m-%d') AS data_date FROM visitor_example_maintenance WHERE user_id=?",
    [userId],
  );
  const date = visitorDate(now),
    english = locale === 'en-US';
  if (!state) return { kind: 'visitor_example', dataDate: null, stale: true, brief: null };
  const manifest = parseExampleManifest(state.manifest_json);
  if (manifest.restored) return { kind: 'visitor_example', dataDate: null, stale: true, brief: null };
  const noteIds = manifest.notes.map((r) => r.id);
  const [notes] = noteIds.length
    ? await db.query(
        'SELECT id,title,type FROM note WHERE create_by=? AND del_flag=0 AND id IN (?) ORDER BY is_top DESC,update_time DESC,id',
        [userId, noteIds],
      )
    : [[]];
  const [[tasks]] = await db.query(
    "SELECT COUNT(*) AS total FROM todo_items WHERE user_id=? AND del_flag=0 AND status='pending' AND ((due_at>=? AND due_at<DATE_ADD(?,INTERVAL 1 DAY)) OR (due_at IS NULL AND occurrence_date=?))",
    [userId, date, date, date],
  );
  const calendar = { date, locale, yesterdayStart: `${offsetDate(date, -1)} 00:00:00` };
  const [workshop, untagged, pending] = await Promise.all([
    compileWorkshopBriefFacts(db, userId, calendar, { projectIds: manifest.projects }),
    summarizeUntaggedResources(db, { userId }),
    queryPendingCount(db, userId),
  ]);
  const project =
    workshop.find(
      (f) => f.id === 'workshop_due' && f.count && f.sources.every((s) => manifest.projects.includes(s.id)),
    ) ||
    workshop.find(
      (f) => f.id === 'workshop_next_step' && f.count && f.sources.every((s) => manifest.projects.includes(s.id)),
    );
  const sources = notes.slice(0, 2).map((n) => ({ type: 'note', id: String(n.id), title: n.title }));
  const insights = [];
  if (Number(tasks.total) || project)
    insights.push({
      id: 'sample-todo',
      factIds: ['todo_due_today', ...(project ? [project.id] : [])],
      text: english
        ? `${Number(tasks.total)} tasks are scheduled for today.${project ? ` ${project.samples[0]}. Continue in the project.` : ''}`
        : `今天安排了 ${Number(tasks.total)} 项待办。${project ? `${project.samples[0]}。打开项目，接着推进这一步。` : ''}`,
      sources: project?.sources || [],
    });
  if (sources.length)
    insights.push({
      id: 'sample-content',
      factIds: ['visitor_content'],
      text: english
        ? 'Explore the illustrated, drawing and rich-text notes. These are demonstration materials, not new activity today.'
        : '打开图文、手绘与富文本，看看同一个笔记空间如何容纳不同表达。这些是演示材料，并非今天新增的活动。',
      sources,
    });
  const [links] = noteIds.length
    ? await db.query(
        `SELECT r.resource_id AS id,t.id AS tag_id,t.name AS tag_name,n.title FROM resource_tag_relations r JOIN tag t ON t.id=r.tag_id AND t.user_id=r.user_id AND t.del_flag=0 JOIN note n ON n.id=r.resource_id AND n.create_by=r.user_id AND n.del_flag=0 WHERE r.user_id=? AND r.resource_type='note' AND r.resource_id IN (?) ORDER BY t.id,n.id LIMIT 80`,
        [userId, noteIds],
      )
    : [[]];
  const groups = new Map();
  for (const row of links) {
    if (!groups.has(row.tag_id)) groups.set(row.tag_id, []);
    groups.get(row.tag_id).push(row);
  }
  const pair = [...groups.values()].find((rows) => rows.length >= 2)?.slice(0, 2);
  if (pair)
    insights.push({
      id: 'sample-connection',
      factIds: ['resource_connection'],
      text: english
        ? `These notes share the tag “${pair[0].tag_name}”. Open the originals and compare how they approach the topic.`
        : `这些笔记通过「${pair[0].tag_name}」标签关联。打开原文，对照它们如何记录同一主题。`,
      sources: pair.map((n) => ({ type: 'note', id: String(n.id), title: n.title })),
    });
  if (untagged.total || pending.pendingTotal)
    insights.push({
      id: 'sample-organize',
      factIds: [
        ...(untagged.total ? ['organize_untagged'] : []),
        ...(pending.pendingTotal ? ['organize_pending'] : []),
      ],
      text: english
        ? `${untagged.total} resources have no tags; ${pending.pendingTotal} are waiting to be organized. These are separate states.`
        : `还有 ${untagged.total} 份资料没有标签，${pending.pendingTotal} 份资料处于待整理状态。可以先补主题，再完成整理。`,
    });
  const sections = [
    {
      id: 'organize',
      title: english ? 'Organize' : '整理',
      items: [
        { id: 'organize_untagged', count: untagged.total },
        { id: 'organize_pending', count: pending.pendingTotal },
      ],
    },
  ];
  return {
    kind: 'visitor_example',
    dataDate: state.data_date,
    stale: state.data_date !== date,
    nextDateAt: Temporal.PlainDate.from(date).add({ days: 1 }).toZonedDateTime('Asia/Shanghai').toInstant().toString(),
    brief: {
      version: 2,
      date,
      generatedBy: 'example',
      headline: english
        ? 'Turn a useful note into the next step of a project.'
        : '让一份有用的笔记，成为项目的下一步。',
      insights,
      sections,
      recommendation: english
        ? 'Choose one action, open its materials, then continue in the project.'
        : '先选一项行动，打开相关资料，再回到项目继续推进。',
    },
  };
}
