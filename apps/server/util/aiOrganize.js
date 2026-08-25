import { EXPLICIT_WEB_READ_MAX_BYTES, fetchWebMeta } from './fetchWebMeta.js';
import { requestAi } from './agent/aiGateway.js';

// AI 自动整理:批量给书签生成名称/描述 + 从「已有标签」匹配 + 建议新标签。
// 单次条数上限只控制响应时长；真实模型调用统一进入 AI Execution，按 Provider 用量结算。

export const ORGANIZE_MAX_BATCH = 20; // 单次最多处理条数(控制单次时长;整完可继续下一批)
export const AI_TAG_SUGGESTION_CAP = 3;
export const AI_TAG_STRONG_CONFIDENCE_MIN = 0.86;

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

const normalizeTagName = (value) =>
  String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase();

function normalizeEvidenceText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/gu, '');
}

function buildStrongTagInstruction(userTags) {
  return [
    `已有标签(JSON 数组):${JSON.stringify(userTags.map((tag) => tag.name))}。`,
    `tagSuggestions 必须是 0-3 个候选，这里的 3 是绝对上限而不是目标数量；0 个或 1 个都是正常结果，大多数单一主题内容只应有 1-2 个。只返回 confidence >= ${AI_TAG_STRONG_CONFIDENCE_MIN} 的候选，confidence 必须是 0-1 之间的数字。`,
    '只保留用户以后会为了重新找到该内容而主动筛选的核心主题。宽泛上位类目、顺带提及、普通使用场景、载体类型和为了凑数的第三项都不是强相关。',
    '只有内容确实存在三个彼此独立的核心主题时才允许返回 3 个；拿不准就不返回。',
    '优先复用语义等价的已有标签；只有核心概念确实强相关且已有标签没有等价项时，才用 source="new" 建议简短的新标签，禁止用新标签补足数量。',
    '每个候选必须标记 relevance="strong"，并在 evidence 中逐字摘录来自输入内容的简短原文依据，禁止改写依据；没有可引用依据或置信度不足的候选不要返回。',
  ].join('\n');
}

// 模型只负责提出候选；服务端仍以“强相关 + 输入中存在原文依据”为硬门禁。
// 映射按模型相关性顺序进行，不能再按数据库标签顺序重排后截断。
function mapTagSuggestion(parsed, userTags, sourceText, { allowSuggestions = true } = {}) {
  if (!allowSuggestions) return { matchedTagIds: [], newTags: [] };
  const sourceEvidence = normalizeEvidenceText(sourceText);
  const existingByName = new Map(userTags.map((tag) => [normalizeTagName(tag.name), tag]));
  const candidates = Array.isArray(parsed?.tagSuggestions) ? parsed.tagSuggestions : [];
  const matchedTagIds = [];
  const newTags = [];
  const seenNames = new Set();

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || candidate.relevance !== 'strong') continue;
    if (candidate.source !== 'existing' && candidate.source !== 'new') continue;
    if (
      typeof candidate.confidence !== 'number' ||
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < AI_TAG_STRONG_CONFIDENCE_MIN ||
      candidate.confidence > 1
    ) {
      continue;
    }
    const name = String(candidate.name || '').trim();
    const nameKey = normalizeTagName(name);
    const evidence = normalizeEvidenceText(candidate.evidence);
    if (
      !name ||
      name.length > 32 ||
      seenNames.has(nameKey) ||
      evidence.length < 2 ||
      !sourceEvidence.includes(evidence)
    ) {
      continue;
    }
    const existing = existingByName.get(nameKey);
    if (existing) matchedTagIds.push(existing.id);
    else if (candidate.source === 'new') newTags.push(name);
    else continue;
    seenNames.add(nameKey);
    if (matchedTagIds.length + newTags.length >= AI_TAG_SUGGESTION_CAP) break;
  }
  return { matchedTagIds, newTags };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('请求已取消');
  error.name = 'AbortError';
  throw error;
}

// 从纯文本(如笔记标题+正文)推荐标签:只匹配/建议标签,不生成名称描述。供「AI 整理笔记」用。
export async function suggestTagsFromText({ text, userTags = [], signal, trace }) {
  throwIfAborted(signal);
  const sourceText = String(text || '').slice(0, 2800);
  const userPrompt = [
    '请根据下面的内容,为它推荐关联标签。',
    '',
    '内容:',
    sourceText,
    '',
    buildStrongTagInstruction(userTags),
    '只输出 JSON 对象:{"tagSuggestions":[{"name":"标签名","source":"existing或new","relevance":"strong","confidence":0.95,"evidence":"输入中的原文依据"}]},不要输出 markdown、代码块或多余解释。',
  ].join('\n');
  const { content } = await requestAi(
    [
      { role: 'system', content: '你是内容整理助手,只输出符合要求的 JSON,不输出任何多余内容。' },
      { role: 'user', content: userPrompt },
    ],
    {
      signal,
      toolChoice: 'none',
      maxTokens: 400,
      temperature: 0.1,
      trace: { ...trace, taskType: 'organize', stage: 'organize_note_tags' },
    },
  );
  const parsed = parseAiJson(content);
  if (!parsed) return null;
  return mapTagSuggestion(parsed, userTags, sourceText);
}

/**
 * 单个书签:AI 生成 name/description + 从已有标签匹配(matchedTagIds)+ 建议新标签(newTags)。
 * 已有 name+description 时【不再抓网页】(省时省钱),直接据已有信息打标签;缺失才抓正文。
 * 书签表单 Skill 与批量整理共用的唯一模型组织实现。
 * @returns {{name,description,matchedTagIds,newTags}|null} 解析失败返回 null
 */
export async function suggestBookmarkMeta({ url, name = '', description = '', userTags = [], signal, trace }) {
  throwIfAborted(signal);
  const curName = String(name || '').trim();
  const curDesc = String(description || '').trim();
  const hasMeta = !!(curName && curDesc);

  let pageInfo;
  let metadataSource = 'provided';
  let fetchReason = '';
  let resolvedUrl = String(url || '').trim();
  if (hasMeta) {
    pageInfo = [`网页名称:${curName}`, `网页描述:${curDesc}`].join('\n');
  } else {
    const meta = await fetchWebMeta(url, { signal, maxContentBytes: EXPLICIT_WEB_READ_MAX_BYTES });
    throwIfAborted(signal);
    metadataSource = meta.ok ? 'fetched' : 'inferred';
    fetchReason = meta.ok ? '' : String(meta.reason || 'FETCH_FAILED');
    if (meta.ok && meta.url) resolvedUrl = String(meta.url).trim() || resolvedUrl;
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

  const tagSourceText = [`网址:${url}`, pageInfo].join('\n');
  const userPrompt = [
    '请为下面这个网页生成适合书签保存的名称、描述,并推荐关联标签。',
    '',
    `网址:${url}`,
    pageInfo,
    '',
    '要求:',
    '- name:简洁自然,像用户自己会给书签起的标题,不超过 20 个字。',
    '- description:用一句简短自然的中文概括网站内容或用途,不超过 50 个字。',
    metadataSource === 'inferred'
      ? '- 当前网页内容不可读取，tagSuggestions 必须返回空数组，禁止仅根据域名猜测标签。'
      : buildStrongTagInstruction(userTags),
    '- 只输出 JSON 对象,格式必须是 {"name":"...","description":"...","tagSuggestions":[{"name":"标签名","source":"existing或new","relevance":"strong","confidence":0.95,"evidence":"网页信息中的原文依据"}]},不要输出 markdown、代码块或多余解释。',
  ].join('\n');

  const { content } = await requestAi(
    [
      { role: 'system', content: '你是书签整理助手,只输出符合要求的 JSON,不输出任何多余内容。' },
      { role: 'user', content: userPrompt },
    ],
    {
      signal,
      toolChoice: 'none',
      maxTokens: 600,
      temperature: 0.1,
      trace: { ...trace, taskType: 'organize', stage: 'organize_bookmark_meta' },
    },
  );
  const parsed = parseAiJson(content);
  if (!parsed || (!parsed.name && !parsed.description && !Array.isArray(parsed.tagSuggestions))) return null;
  const { matchedTagIds, newTags } = mapTagSuggestion(parsed, userTags, tagSourceText, {
    allowSuggestions: metadataSource !== 'inferred',
  });
  return {
    name: String(parsed.name || '').trim(),
    description: String(parsed.description || '').trim(),
    matchedTagIds,
    newTags,
    metadataSource,
    fetchReason,
    resolvedUrl,
  };
}
