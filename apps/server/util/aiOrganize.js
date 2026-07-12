import pool from '../db/index.js';
import { fetchWebMeta } from './fetchWebMeta.js';
import { requestDeepSeek } from './agent/deepseekClient.js';
import { levelForExp } from './growth.js';

// AI 自动整理:批量给书签生成名称/描述 + 从「已有标签」匹配 + 建议新标签。
// 经济模型(与"存储/AI额度随段位涨、积分买更多"同构):每日免费 N 条随等级解锁,超出按积分计费。

export const ORGANIZE_COST_PER_ITEM = 3; // 超出每日免费额度后,每条消耗的积分
export const ORGANIZE_MAX_BATCH = 15; // 单次最多处理条数(控制时长与成本;可多次运行)

// 每日免费整理条数(随等级):Lv1-2:5 → Lv3-5:10 → Lv6-9:20 → Lv10-14:40 → 满级:80
export function organizeFreeFor(level) {
  const lv = Number(level) || 1;
  if (lv >= 15) return 80;
  if (lv >= 10) return 40;
  if (lv >= 6) return 20;
  if (lv >= 3) return 10;
  return 5;
}

function levelOf(exp, userRole) {
  return userRole === 'root' ? 15 : levelForExp(Number(exp) || 0);
}

function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * 单个书签:AI 生成 name/description + 从已有标签匹配(matchedTagIds)+ 建议新标签(newTags)。
 * 已有 name+description 时【不再抓网页】(省时省钱),直接据已有信息打标签;缺失才抓正文。
 * 抽自 chatHandle.generateBookmarkMeta,供「单条智能生成」与「批量整理」共用。
 * @returns {{name,description,matchedTagIds,newTags}|null} 解析失败返回 null
 */
export async function suggestBookmarkMeta({ url, name = '', description = '', userTags = [] }) {
  const curName = String(name || '').trim();
  const curDesc = String(description || '').trim();
  const hasMeta = !!(curName && curDesc);

  let pageInfo;
  if (hasMeta) {
    pageInfo = [`网页名称:${curName}`, `网页描述:${curDesc}`].join('\n');
  } else {
    const meta = await fetchWebMeta(url);
    pageInfo = meta.ok
      ? [
          `网页标题:${meta.title || curName || '(无)'}`,
          `网页描述:${meta.description || curDesc || '(无)'}`,
          meta.siteName ? `站点名称:${meta.siteName}` : '',
          meta.keywords ? `关键词:${meta.keywords}` : '',
          meta.bodyText ? `正文摘录:${meta.bodyText}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '(未能读取到该网页的内容,请仅根据网址本身合理推测,不要编造具体功能或名称。)';
  }

  const tagNameList = userTags.map((t) => t.name);
  const userPrompt = [
    '请为下面这个网页生成适合书签保存的名称、描述,并推荐关联标签。',
    '',
    `网址:${url}`,
    pageInfo,
    '',
    '要求:',
    '- name:简洁自然,像用户自己会给书签起的标题,不超过 20 个字。',
    '- description:用一句简短自然的中文概括网站内容或用途,不超过 50 个字。',
    `- 已有标签(JSON 数组):${JSON.stringify(
      tagNameList,
    )}。从"已有标签"里挑选与该网页最相关的标签放进 matchedTags(0-4 个,必须与列表中的文字完全一致);若都不合适,matchedTags 返回空数组,并在 newTags 里给出 1-3 个建议新增的简短标签名(2-6 个字)。`,
    '- 只输出 JSON 对象,格式必须是 {"name":"...","description":"...","matchedTags":["..."],"newTags":["..."]},不要输出 markdown、代码块或多余解释。',
  ].join('\n');

  const { content } = await requestDeepSeek([
    { role: 'system', content: '你是书签整理助手,只输出符合要求的 JSON,不输出任何多余内容。' },
    { role: 'user', content: userPrompt },
  ]);
  const cleanText = String(content || '')
    .replace(/```json|```/g, '')
    .trim();

  let parsed = null;
  try {
    parsed = JSON.parse(cleanText);
  } catch {
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed || (!parsed.name && !parsed.description && !Array.isArray(parsed.matchedTags))) return null;

  const norm = (s) => String(s || '').trim().toLowerCase();
  const matchedNames = Array.isArray(parsed.matchedTags) ? parsed.matchedTags : [];
  const matchedTagIds = userTags.filter((t) => matchedNames.some((n) => norm(n) === norm(t.name))).map((t) => t.id);
  const newTags = (Array.isArray(parsed.newTags) ? parsed.newTags : [])
    .map((s) => String(s || '').trim())
    .filter((n) => n && !userTags.some((t) => norm(t.name) === norm(n)))
    .slice(0, 3);
  return {
    name: String(parsed.name || '').trim(),
    description: String(parsed.description || '').trim(),
    matchedTagIds,
    newTags,
  };
}

// 当前整理额度状态(只读):等级、每日免费额度、今日已用、剩余、当前积分
export async function getOrganizeState(userId, userRole = null) {
  const [rows] = await pool.query(
    'SELECT points, exp, ai_organize_day, ai_organize_used FROM user_growth WHERE user_id = ? LIMIT 1',
    [userId],
  );
  const g = rows[0] || {};
  const today = dayKey();
  const level = levelOf(g.exp, userRole);
  const freeDaily = organizeFreeFor(level);
  const usedToday = g.ai_organize_day === today ? Number(g.ai_organize_used) || 0 : 0;
  return {
    level,
    freeDaily,
    usedToday,
    freeRemaining: Math.max(0, freeDaily - usedToday),
    points: Number(g.points || 0),
    costPerItem: ORGANIZE_COST_PER_ITEM,
    maxBatch: ORGANIZE_MAX_BATCH,
  };
}

// 结算 count 条整理消耗:优先用免费额度,超出扣积分。事务 + FOR UPDATE,防并发。
// 返回 {ok, freeUsed, pointsSpent}。count 应已按 quote 上限约束(pre-check 保证可负担)。
export async function chargeOrganize(userId, count, userRole = null) {
  if (!(count > 0)) return { ok: true, freeUsed: 0, pointsSpent: 0 };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT points, exp, ai_organize_day, ai_organize_used FROM user_growth WHERE user_id = ? FOR UPDATE',
      [userId],
    );
    const g = rows[0];
    if (!g) {
      await conn.rollback();
      return { ok: false, reason: 'no_growth', freeUsed: 0, pointsSpent: 0 };
    }
    const today = dayKey();
    const level = levelOf(g.exp, userRole);
    const freeDaily = organizeFreeFor(level);
    const usedToday = g.ai_organize_day === today ? Number(g.ai_organize_used) || 0 : 0;
    const freeRemaining = Math.max(0, freeDaily - usedToday);
    const freeUsed = Math.min(count, freeRemaining);
    const paid = count - freeUsed;
    const cost = paid * ORGANIZE_COST_PER_ITEM;
    if (cost > Number(g.points || 0)) {
      await conn.rollback();
      return { ok: false, reason: 'insufficient', freeUsed: 0, pointsSpent: 0 };
    }
    if (cost > 0) {
      await conn.query('UPDATE user_growth SET points = points - ? WHERE user_id = ?', [cost, userId]);
      await conn.query("INSERT INTO points_log (user_id, delta, reason, ref) VALUES (?, ?, 'ai_organize', ?)", [
        userId,
        -cost,
        today,
      ]);
    }
    await conn.query('UPDATE user_growth SET ai_organize_day = ?, ai_organize_used = ? WHERE user_id = ?', [
      today,
      usedToday + count,
      userId,
    ]);
    await conn.commit();
    return { ok: true, freeUsed, pointsSpent: cost };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    conn.release();
  }
}
