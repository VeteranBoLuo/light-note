import { fetchWebMeta } from './fetchWebMeta.js';
import { requestDeepSeek } from './agent/deepseekClient.js';

// AI 自动整理:批量给书签生成名称/描述 + 从「已有标签」匹配 + 建议新标签。
// 与单条「智能生成」保持一致——【免费】,不扣积分、不设每日固定次数;仅用单次条数上限防跑量,
// 可分批多次运行。真正的积分出口在商店(AI 加油包/扩容/称号/头像框)与抽奖,不在这个高频提效功能上设卡。
// AI 用量统一受 aiQuota 观测(当前 dry-run);未来若开启 AI_GATE_ENFORCE,所有 AI 功能一并按 token 额度限流。

export const ORGANIZE_MAX_BATCH = 20; // 单次最多处理条数(控制单次时长;整完可继续下一批)

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
