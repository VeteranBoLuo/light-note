import { fetchWebMeta } from './fetchWebMeta.js';
import { requestDeepSeek } from './agent/deepseekClient.js';

// AI 自动整理:批量给书签生成名称/描述 + 从「已有标签」匹配 + 建议新标签。
// 与单条「智能生成」保持一致——【免费】,不扣积分、不设每日固定次数;仅用单次条数上限防跑量,
// 可分批多次运行。真正的积分出口在商店(AI 加油包/扩容/称号/头像框)与抽奖,不在这个高频提效功能上设卡。
// AI 用量统一受 aiQuota 观测(当前 dry-run);未来若开启 AI_GATE_ENFORCE,所有 AI 功能一并按 token 额度限流。

export const ORGANIZE_MAX_BATCH = 20; // 单次最多处理条数(控制单次时长;整完可继续下一批)

// 解析 AI 返回的 JSON(容错去 markdown / 提取花括号)
function parseAiJson(content) {
  const clean = String(content || '')
    .replace(/```json|```/g, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

// 把 AI 的 matchedTags(标签名)映射为已有标签 id;newTags 过滤掉与已有重名的
function mapTagSuggestion(parsed, userTags) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const matchedNames = Array.isArray(parsed?.matchedTags) ? parsed.matchedTags : [];
  const matchedTagIds = userTags.filter((t) => matchedNames.some((n) => norm(n) === norm(t.name))).map((t) => t.id);
  const newTags = (Array.isArray(parsed?.newTags) ? parsed.newTags : [])
    .map((s) => String(s || '').trim())
    .filter((n) => n && !userTags.some((t) => norm(t.name) === norm(n)))
    .slice(0, 3);
  return { matchedTagIds, newTags };
}

// 从纯文本(如笔记标题+正文)推荐标签:只匹配/建议标签,不生成名称描述。供「AI 整理笔记」用。
export async function suggestTagsFromText({ text, userTags = [] }) {
  const tagNameList = userTags.map((t) => t.name);
  const userPrompt = [
    '请根据下面的内容,为它推荐关联标签。',
    '',
    '内容:',
    String(text || '').slice(0, 1500),
    '',
    `已有标签(JSON 数组):${JSON.stringify(
      tagNameList,
    )}。从"已有标签"里挑最相关的放进 matchedTags(必须与列表文字完全一致);不足或都不合适时,在 newTags 给建议新增的简短标签名(2-6 个字)。**matchedTags 与 newTags 合计最多 3 个,只保留最相关的,宁少勿多,优先复用已有标签。**`,
    '只输出 JSON 对象:{"matchedTags":["..."],"newTags":["..."]},不要输出 markdown、代码块或多余解释。',
  ].join('\n');
  const { content } = await requestDeepSeek([
    { role: 'system', content: '你是内容整理助手,只输出符合要求的 JSON,不输出任何多余内容。' },
    { role: 'user', content: userPrompt },
  ]);
  const parsed = parseAiJson(content);
  if (!parsed) return null;
  const mapped = mapTagSuggestion(parsed, userTags);
  // 兜底封顶:总推荐数 ≤ 3(prompt 已要求,此处防模型偶尔不听话);优先保留已有标签,不足再用新建标签补满
  const TAG_CAP = 3;
  const matchedTagIds = (mapped.matchedTagIds || []).slice(0, TAG_CAP);
  const newTags = (mapped.newTags || []).slice(0, Math.max(0, TAG_CAP - matchedTagIds.length));
  return { matchedTagIds, newTags };
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
    )}。从"已有标签"里挑选与该网页最相关的标签放进 matchedTags(必须与列表中的文字完全一致);不足或都不合适时,在 newTags 里给出建议新增的简短标签名(2-6 个字)。**matchedTags 与 newTags 合计最多 3 个,只保留最相关的,宁少勿多,优先复用已有标签。**`,
    '- 只输出 JSON 对象,格式必须是 {"name":"...","description":"...","matchedTags":["..."],"newTags":["..."]},不要输出 markdown、代码块或多余解释。',
  ].join('\n');

  const { content } = await requestDeepSeek([
    { role: 'system', content: '你是书签整理助手,只输出符合要求的 JSON,不输出任何多余内容。' },
    { role: 'user', content: userPrompt },
  ]);
  const parsed = parseAiJson(content);
  if (!parsed || (!parsed.name && !parsed.description && !Array.isArray(parsed.matchedTags))) return null;
  const mapped = mapTagSuggestion(parsed, userTags);
  // 兜底封顶:推荐标签总数 ≤ 3(与笔记 AI 整理一致);优先保留已有标签,不足再用新建标签补满
  const TAG_CAP = 3;
  const matchedTagIds = (mapped.matchedTagIds || []).slice(0, TAG_CAP);
  const newTags = (mapped.newTags || []).slice(0, Math.max(0, TAG_CAP - matchedTagIds.length));
  return {
    name: String(parsed.name || '').trim(),
    description: String(parsed.description || '').trim(),
    matchedTagIds,
    newTags,
  };
}
