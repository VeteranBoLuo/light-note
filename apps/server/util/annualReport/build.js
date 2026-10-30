/**
 * 年度报告取数与组装。
 *
 * - 每次请求实时计算，不写缓存：标题、网站和标签名只出现在本人的实时响应里，删除后即刻消失。
 * - 记录口径与周报一致（新增书签/笔记/文件、完成待办、完成整理，排除注册示例），另外排除已删除的待办；
 *   批量导入或上传按 rules.js 的密度规则识别后不计入任何统计与明细。
 * - 各表文本列排序规则不同，按类型分别取数后在内存合并，不做跨表 UNION。
 */
import pool from '../../db/index.js';
import { getGrowth, levelForExp, rankOf } from '../growth.js';
import { getGrowthCalendarContext } from '../growthPreferences.js';
import { SEED_FILTER } from '../weeklyReport.js';
import { noteDisplayLength } from './noteText.js';
import {
  ANNUAL_THRESHOLDS,
  GROWTH_SYSTEM_SINCE,
  bookmarkDomain,
  classifyAnnualTier,
  getAnnualReportRange,
  longestCheckinStreak,
  markBatchRecords,
  parseLocalTime,
  peakTimeSegment,
  resolveAnnualTitle,
  selectAnnualChapters,
  summarizeAnnualRecords,
  weeklyBuckets,
} from './rules.js';

// 正文按批读取与解析，每批之间回到事件循环，单批解析时间保持在百毫秒级。
const NOTE_CONTENT_BATCH = 50;
const LIGHT_ITEM_LIMIT = 20;
const RESOURCE_TYPES = new Set(['bookmark', 'note', 'file']);
const LOCAL_TIME = (column) => `DATE_FORMAT(DATE_ADD(${column}, INTERVAL ? MINUTE), '%Y-%m-%d %H:%i:%s')`;

function isoDate(time) {
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

async function queryRecords(db, userId, range) {
  const bounds = [range.shiftMinutes, userId, range.startSql, range.nextSql];
  const [[bookmarks], [notes], [files], [todos], [organized]] = await Promise.all([
    db.query(
      `SELECT b.id AS id, b.url AS url, ${LOCAL_TIME('b.create_time')} AS localAt
         FROM bookmark b
        WHERE b.user_id = ? AND b.del_flag = 0 AND b.create_time >= ? AND b.create_time < ?
          AND ${SEED_FILTER.bookmark}`,
      bounds,
    ),
    db.query(
      `SELECT n.id AS id, ${LOCAL_TIME('n.create_time')} AS localAt
         FROM note n
        WHERE n.create_by = ? AND n.del_flag = 0 AND n.create_time >= ? AND n.create_time < ?
          AND ${SEED_FILTER.note}`,
      bounds,
    ),
    db.query(
      `SELECT CAST(f.id AS CHAR) AS id, ${LOCAL_TIME('f.create_time')} AS localAt
         FROM files f
        WHERE f.create_by = ? AND f.del_flag = 0 AND f.create_time >= ? AND f.create_time < ?
          AND ${SEED_FILTER.file}`,
      bounds,
    ),
    db.query(
      `SELECT td.id AS id, ${LOCAL_TIME('td.completed_at')} AS localAt
         FROM todo_items td
        WHERE td.user_id = ? AND td.del_flag = 0 AND td.completed_at >= ? AND td.completed_at < ?`,
      bounds,
    ),
    db.query(
      `SELECT ri.id AS id, ${LOCAL_TIME('ri.complete_time')} AS localAt
         FROM resource_inbox ri
        WHERE ri.user_id = ? AND ri.complete_time >= ? AND ri.complete_time < ?
          AND ${SEED_FILTER.organize}`,
      bounds,
    ),
  ]);
  const toRecords = (type, rows) =>
    rows.map((row) => ({ type, id: String(row.id), url: row.url, time: parseLocalTime(row.localAt) }));
  return markBatchRecords([
    ...toRecords('bookmark', bookmarks),
    ...toRecords('note', notes),
    ...toRecords('file', files),
    ...toRecords('todo', todos),
    ...toRecords('organize', organized),
  ]);
}

/** 按类型补读标题；只返回仍存在的资源，删除的资料不会出现在报告里。 */
async function loadResourceTitles(db, userId, refs) {
  const ids = { bookmark: new Set(), note: new Set(), file: new Set() };
  for (const ref of refs) if (ref && RESOURCE_TYPES.has(ref.type)) ids[ref.type].add(String(ref.id));
  const titles = new Map();
  const queries = [
    ['bookmark', 'SELECT id, name AS title FROM bookmark WHERE user_id = ? AND del_flag = 0 AND id IN (?)'],
    ['note', 'SELECT id, title FROM note WHERE create_by = ? AND del_flag = 0 AND id IN (?)'],
    [
      'file',
      'SELECT CAST(id AS CHAR) AS id, file_name AS title FROM files WHERE create_by = ? AND del_flag = 0 AND id IN (?)',
    ],
  ];
  await Promise.all(
    queries.map(async ([type, sql]) => {
      if (!ids[type].size) return;
      const [rows] = await db.query(sql, [userId, [...ids[type]]]);
      for (const row of rows) titles.set(`${type}:${row.id}`, String(row.title || '').trim());
    }),
  );
  return titles;
}

async function summarizeNotes(db, userId, range, noteRecords) {
  const ids = noteRecords.map((record) => record.id);
  const lengths = new Map();
  let chars = 0;
  for (let offset = 0; offset < ids.length; offset += NOTE_CONTENT_BATCH) {
    const [rows] = await db.query(
      'SELECT id, title, type, content FROM note WHERE create_by = ? AND del_flag = 0 AND id IN (?)',
      [userId, ids.slice(offset, offset + NOTE_CONTENT_BATCH)],
    );
    for (const row of rows) {
      const length = noteDisplayLength(row.content, row.type);
      lengths.set(String(row.id), { title: String(row.title || '').trim(), chars: length });
      chars += length;
    }
  }
  const [versionRows] = await db.query(
    `SELECT nv.note_id AS noteId, COUNT(*) AS versions
       FROM note_versions nv
      WHERE nv.create_by = ? AND nv.create_time >= ? AND nv.create_time < ?
      GROUP BY nv.note_id
      ORDER BY versions DESC
      LIMIT 10`,
    [userId, range.startSql, range.nextSql],
  );
  const perMonth = Array(12).fill(0);
  for (const record of noteRecords) perMonth[new Date(record.time).getUTCMonth()]++;
  const longestEntry = [...lengths.entries()].sort((left, right) => right[1].chars - left[1].chars)[0];
  return {
    count: noteRecords.length,
    chars,
    avgChars: noteRecords.length ? Math.round(chars / noteRecords.length) : 0,
    perMonth,
    versionCandidates: versionRows
      .map((row) => ({ id: String(row.noteId), versions: Number(row.versions || 0) }))
      .filter((row) => row.versions >= 2),
    longest: longestEntry && longestEntry[1].chars > 0 ? { id: longestEntry[0], ...longestEntry[1] } : null,
    lengths,
  };
}

async function summarizeKeywords(db, userId, range, counted) {
  const live = new Set(counted.filter((record) => RESOURCE_TYPES.has(record.type)).map((r) => `${r.type}:${r.id}`));
  if (!live.size) return { top: [], newTags: [], usable: 0 };
  const [relations] = await db.query(
    `SELECT tag_id AS tagId, resource_type AS type, resource_id AS resourceId
       FROM resource_tag_relations
      WHERE user_id = ? AND resource_type IN ('bookmark', 'note', 'file')`,
    [userId],
  );
  const uses = new Map();
  for (const relation of relations) {
    if (!live.has(`${relation.type}:${relation.resourceId}`)) continue;
    uses.set(String(relation.tagId), (uses.get(String(relation.tagId)) || 0) + 1);
  }
  const candidates = [...uses.entries()].filter(([, count]) => count >= ANNUAL_THRESHOLDS.keywordMinUses);
  if (!candidates.length) return { top: [], newTags: [], usable: 0 };
  const [tags] = await db.query(
    `SELECT id, name, (create_time >= ? AND create_time < ?) AS isNew,
            MONTH(DATE_ADD(create_time, INTERVAL ? MINUTE)) AS month
       FROM tag WHERE user_id = ? AND del_flag = 0 AND id IN (?)`,
    [range.startSql, range.nextSql, range.shiftMinutes, userId, candidates.map(([id]) => id)],
  );
  const byId = new Map(tags.map((tag) => [String(tag.id), tag]));
  const ranked = candidates
    .filter(([id]) => byId.has(id) && String(byId.get(id).name || '').trim())
    .map(([id, count]) => ({ id, name: String(byId.get(id).name).trim(), count, tag: byId.get(id) }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  return {
    top: ranked.slice(0, 5).map(({ id, name, count }) => ({ id, name, count })),
    newTags: ranked
      .filter((item) => Number(item.tag.isNew) === 1)
      .slice(0, 3)
      .map(({ id, name, count, tag }) => ({ id, name, count, month: Number(tag.month) || null })),
    usable: ranked.length,
  };
}

async function summarizeGrowth(db, userId, range, userRole) {
  const [[checkins], [[expRow]], [[pointsRow]], [[achievementRow]], growth] = await Promise.all([
    db.query(
      `SELECT ge.day AS day FROM growth_events ge
        WHERE ge.user_id = ? AND ge.source = 'checkin' AND ge.status = 'granted' AND ge.day >= ? AND ge.day <= ?`,
      [userId, range.startKey, range.endKey],
    ),
    db.query(
      `SELECT COALESCE(SUM(CASE WHEN create_time < ? THEN amount ELSE 0 END), 0) AS expBefore,
              COALESCE(SUM(CASE WHEN create_time >= ? AND create_time < ? THEN amount ELSE 0 END), 0) AS expDuring
         FROM growth_events WHERE user_id = ? AND status = 'granted' AND create_time < ?`,
      [range.startSql, range.startSql, range.nextSql, userId, range.nextSql],
    ),
    db.query(
      `SELECT COALESCE(SUM(delta), 0) AS earned FROM points_log
        WHERE user_id = ? AND delta > 0 AND create_time >= ? AND create_time < ?`,
      [userId, range.startSql, range.nextSql],
    ),
    db.query(
      `SELECT COUNT(*) AS unlocked FROM user_achievements
        WHERE user_id = ? AND unlocked_at >= ? AND unlocked_at < ? AND achievement_key NOT LIKE 'annual_review_%'`,
      [userId, range.startSql, range.nextSql],
    ),
    getGrowth(userId, { userRole, db }),
  ]);
  const checkinDays = new Set(checkins.map((row) => String(row.day)));
  const startLevel = levelForExp(Number(expRow?.expBefore || 0));
  return {
    checkinDays: checkinDays.size,
    longestCheckinStreak: longestCheckinStreak([...checkinDays]),
    exp: Number(expRow?.expDuring || 0),
    points: Number(pointsRow?.earned || 0),
    achievements: Number(achievementRow?.unlocked || 0),
    level: Number(growth?.level || 1),
    levelName: growth?.name || rankOf(Number(growth?.level || 1))?.name || null,
    startLevel,
    since: GROWTH_SYSTEM_SINCE > range.start ? GROWTH_SYSTEM_SINCE : range.start,
  };
}

/**
 * 加入日与成长中心的陪伴天数同源：注册时间、最早书签、最早笔记取最早一天。
 * 早期账号的注册时间可能为空，只读这一列会把老用户算成「第 1 天」。
 */
async function loadProfile(db, userId, range) {
  const localDay = (column) => `DATE_FORMAT(DATE_ADD(${column}, INTERVAL ? MINUTE), '%Y-%m-%d')`;
  const [[row]] = await db.query(
    `SELECT
        (SELECT ${localDay('create_time')} FROM \`user\` WHERE id = ? LIMIT 1) AS createdDay,
        (SELECT ${localDay('MIN(b.create_time)')} FROM bookmark b
          WHERE b.user_id = ? AND b.del_flag = 0 AND ${SEED_FILTER.bookmark}) AS firstBookmarkDay,
        (SELECT ${localDay('MIN(n.create_time)')} FROM note n
          WHERE n.create_by = ? AND n.del_flag = 0 AND ${SEED_FILTER.note}) AS firstNoteDay`,
    [range.shiftMinutes, userId, range.shiftMinutes, userId, range.shiftMinutes, userId],
  );
  const joinedDay = [row?.createdDay, row?.firstBookmarkDay, row?.firstNoteDay].filter(Boolean).sort()[0] || null;
  const joinDays = joinedDay
    ? Math.max(
        1,
        Math.round((Date.parse(`${range.today}T00:00:00Z`) - Date.parse(`${joinedDay}T00:00:00Z`)) / 86_400_000) + 1,
      )
    : null;
  return { joinedDay, joinDays };
}

function resourceItem(record, titles) {
  if (!record) return null;
  const title = titles.get(`${record.type}:${record.id}`);
  if (title === undefined) return null;
  return { type: record.type, id: record.id, title, date: isoDate(record.time) };
}

/**
 * 本人实时报告。返回 tier=empty 时不含任何明细。
 * tierOnly 只返回分级（通知判断用），不读正文、标签和成长流水。
 */
export async function buildAnnualReport(
  userId,
  { year, userRole = null, now = new Date(), db = pool, tierOnly = false } = {},
) {
  const calendar = await getGrowthCalendarContext(userId, { db, now });
  const range = getAnnualReportRange({ year, now, calendar });
  const base = { year, phase: range.phase, start: range.start, dataEnd: range.dataEnd, timezone: calendar.timezone };
  if (!range.elapsedDays) return { ...base, tier: 'empty', chapters: [], batchExcluded: 0 };

  const records = await queryRecords(db, userId, range);
  const summary = summarizeAnnualRecords(records, range);
  const tier = classifyAnnualTier(summary);
  if (tier === 'empty' || tierOnly) return { ...base, tier, chapters: [], batchExcluded: summary.batchExcluded };

  const counted = records.filter((record) => !record.batch);
  const resources = counted.filter((record) => RESOURCE_TYPES.has(record.type));
  const [profile, growth] = await Promise.all([
    loadProfile(db, userId, range),
    summarizeGrowth(db, userId, range, userRole),
  ]);
  const full = tier === 'full';
  const notes = full
    ? await summarizeNotes(
        db,
        userId,
        range,
        counted.filter((r) => r.type === 'note'),
      )
    : null;
  const keywords = full ? await summarizeKeywords(db, userId, range, counted) : { top: [], newTags: [], usable: 0 };

  const firstResource = resources[0] || null;
  const lastResource = resources.at(-1) || null;
  const lightItems = full ? [] : resources.slice(-LIGHT_ITEM_LIMIT);
  const titleRefs = [firstResource, lastResource, ...lightItems];
  if (notes) {
    titleRefs.push(...notes.versionCandidates.map((row) => ({ type: 'note', id: row.id })));
    if (notes.longest) titleRefs.push({ type: 'note', id: notes.longest.id });
  }
  const titles = await loadResourceTitles(db, userId, titleRefs);

  const bookmarkRecords = counted.filter((record) => record.type === 'bookmark');
  const domainCounts = new Map();
  const bookmarkDays = new Map();
  for (const record of bookmarkRecords) {
    const domain = bookmarkDomain(record.url);
    if (domain) domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    const day = isoDate(record.time);
    bookmarkDays.set(day, (bookmarkDays.get(day) || 0) + 1);
  }
  const busiestBookmarkDay = [...bookmarkDays.entries()].reduce(
    (best, [date, count]) => (!best || count > best.count ? { date, count } : best),
    null,
  );

  const mostRevised = notes?.versionCandidates.find((row) => titles.has(`note:${row.id}`)) || null;
  const longestNote = notes?.longest && titles.has(`note:${notes.longest.id}`) ? notes.longest : null;
  // 明细里的“用心写的笔记”：改得最多、最长，再补版本数靠前的，最多 4 篇。
  const noteHighlights = [];
  if (notes) {
    const versionsOf = new Map(notes.versionCandidates.map((row) => [row.id, row.versions]));
    for (const id of [mostRevised?.id, longestNote?.id, ...notes.versionCandidates.map((row) => row.id)]) {
      if (!id || noteHighlights.length >= 4 || noteHighlights.some((item) => item.id === id)) continue;
      if (!titles.has(`note:${id}`)) continue;
      noteHighlights.push({
        id,
        title: titles.get(`note:${id}`),
        versions: versionsOf.get(id) ?? null,
        chars: notes.lengths.get(id)?.chars ?? null,
      });
    }
  }

  const chapters = selectAnnualChapters(tier, {
    activeDays: summary.activeDays,
    notes: summary.byType.note,
    bookmarks: summary.byType.bookmark,
    keywordTags: keywords.usable,
    total: summary.total,
    todos: summary.byType.todo,
    checkinDays: growth.checkinDays,
  });

  return {
    ...base,
    tier,
    chapters,
    profile: { ...profile, level: growth.level, levelName: growth.levelName },
    title: resolveAnnualTitle(tier, summary),
    overview: {
      total: summary.total,
      byType: summary.byType,
      resources: summary.byType.bookmark + summary.byType.note + summary.byType.file,
      batchExcluded: summary.batchExcluded,
      first: resourceItem(firstResource, titles),
      last: resourceItem(lastResource, titles),
    },
    rhythm: {
      activeDays: summary.activeDays,
      days: summary.days,
      months: summary.months,
      monthActive: summary.monthActive,
      longestStreak: summary.longestStreak,
      busiestDay: summary.busiestDay,
      busiestMonth: summary.busiestMonth,
    },
    notes: notes
      ? {
          count: notes.count,
          chars: notes.chars,
          avgChars: notes.avgChars,
          perMonth: notes.perMonth,
          mostRevised: mostRevised
            ? { id: mostRevised.id, title: titles.get(`note:${mostRevised.id}`), versions: mostRevised.versions }
            : null,
          longest: longestNote
            ? { id: longestNote.id, title: titles.get(`note:${longestNote.id}`), chars: longestNote.chars }
            : null,
          highlights: noteHighlights,
        }
      : null,
    bookmarks: full
      ? {
          count: summary.byType.bookmark,
          domains: [...domainCounts.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 5)
            .map(([domain, count]) => ({ domain, count })),
          busiestDay: busiestBookmarkDay,
        }
      : null,
    keywords: full ? { top: keywords.top, newTags: keywords.newTags } : null,
    time: full
      ? {
          hours: summary.hours,
          peakHour: summary.peakHour,
          peakSegment: peakTimeSegment(summary.hours),
          weekdayShare: Math.round((1 - summary.weekendShare) * 100),
        }
      : null,
    action: {
      todos: summary.byType.todo,
      organized: summary.byType.organize,
      checkinDays: growth.checkinDays,
      longestCheckinStreak: growth.longestCheckinStreak,
      achievements: growth.achievements,
      points: growth.points,
      exp: growth.exp,
      startLevel: growth.startLevel,
      level: growth.level,
      since: growth.since,
    },
    light: full
      ? null
      : {
          items: lightItems.map((record) => resourceItem(record, titles)).filter(Boolean),
          ...weeklyBuckets(records, range, profile.joinedDay),
        },
  };
}

/** 入口判断只看今年是否有非示例记录，不做批量识别，开销保持在几次索引点查。 */
export async function hasAnnualRecords(userId, { year, now = new Date(), db = pool } = {}) {
  const calendar = await getGrowthCalendarContext(userId, { db, now });
  const range = getAnnualReportRange({ year, now, calendar });
  if (!range.elapsedDays) return false;
  const bounds = [userId, range.startSql, range.nextSql];
  const [[row]] = await db.query(
    `SELECT (
        EXISTS (SELECT 1 FROM bookmark b WHERE b.user_id = ? AND b.del_flag = 0
                 AND b.create_time >= ? AND b.create_time < ? AND ${SEED_FILTER.bookmark})
        OR EXISTS (SELECT 1 FROM note n WHERE n.create_by = ? AND n.del_flag = 0
                 AND n.create_time >= ? AND n.create_time < ? AND ${SEED_FILTER.note})
        OR EXISTS (SELECT 1 FROM files f WHERE f.create_by = ? AND f.del_flag = 0
                 AND f.create_time >= ? AND f.create_time < ? AND ${SEED_FILTER.file})
        OR EXISTS (SELECT 1 FROM todo_items td WHERE td.user_id = ? AND td.del_flag = 0
                 AND td.completed_at >= ? AND td.completed_at < ?)
        OR EXISTS (SELECT 1 FROM resource_inbox ri WHERE ri.user_id = ?
                 AND ri.complete_time >= ? AND ri.complete_time < ? AND ${SEED_FILTER.organize})
      ) AS present`,
    [...bounds, ...bounds, ...bounds, ...bounds, ...bounds],
  );
  return Number(row?.present || 0) === 1;
}
