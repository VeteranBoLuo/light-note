import { createHash } from 'node:crypto';
import { load } from 'cheerio';

export const ADVICE_FACT_ID = 'recommendation_evidence';
export const ADVICE_POLICY_VERSION = 7;
export const ADVICE_CONTEXT_FACT_IDS = Object.freeze([
  'todo_overdue',
  'todo_due_today',
  'todo_scheduled_today',
  'workshop_attention',
  'workshop_due',
  'workshop_next_step',
  'workshop_result',
]);

// 使用待整理统一读模型的归属校验；仅纳入真实文本，不把文件名、绘图 JSON 或 URL 当正文。
export function compileAdviceEvidence(items) {
  const evidence = [];
  const seen = new Set();
  for (const item of items.slice(0, 20)) {
    if (!['note', 'bookmark', 'file'].includes(item.resourceType) || !item.resourceId || !item.title?.trim()) continue;
    if (item.resourceType === 'file' && typeof item.preparedText !== 'string') continue;
    if (item.resourceType === 'note' && item.detail === 'drawing') continue;
    const $ = load(String(item.summary || '').slice(0, 65536));
    $('script,style,iframe,svg,img').remove();
    $('p,div,li,br,h1,h2,h3').append(' ');
    const excerpt = (item.preparedText ?? $.root().text()).replace(/\s+/gu, ' ').trim().slice(0, 600);
    const readable = excerpt.replace(/!\[[^\]]*\]\([^)]*\)/gu, '').replace(/https?:\/\/\S+/giu, '').trim();
    // 只过滤无法提供短引文的空壳；是否有行动价值由模型明确判断。
    const identity = `${item.resourceType}:${item.resourceId}`;
    if (readable.length < 8 || !/\p{L}/u.test(readable) || seen.has(identity)) continue;
    seen.add(identity);
    evidence.push({
      key: `material_${evidence.length + 1}`,
      title: item.title.trim().replace(/\s+/gu, ' ').slice(0, 80),
      excerpt,
      source: { type: item.resourceType, id: item.resourceId, title: item.title.trim().slice(0, 80) },
    });
    if (evidence.length === 3) break;
  }
  return evidence;
}

export function adviceContext(facts, locale) {
  const evidence = facts.find((fact) => fact.id === ADVICE_FACT_ID)?.evidence || [];
  // 与正文有关的变化使判断失效；新增统计、自然日和无关数量不会触发重复分析。
  const contextFacts = facts.filter((fact) => ADVICE_CONTEXT_FACT_IDS.includes(fact.id) && fact.count > 0);
  const key = evidence.length
    ? createHash('sha256')
        .update(JSON.stringify([ADVICE_POLICY_VERSION, locale, evidence, contextFacts]))
        .digest('hex')
    : '';
  return { evidence, key };
}

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, '');

function mentionsName(text, name) {
  if (/^[\p{Script=Latin}\d\s]+$/u.test(name)) {
    const pattern = name
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
      .replace(/\s+/gu, '\\s+');
    return new RegExp(`\\b${pattern}\\b`, 'iu').test(text);
  }
  return normalize(text).includes(normalize(name));
}

// 正文仅用于排重，不能给建议补充所选资料中没有的任务、项目或其他资料身份。
function borrowsBodyIdentity(action, material, body) {
  const supported = `${material.title || ''}\n${material.excerpt}`;
  for (const text of body) {
    for (const match of text.matchAll(
      /「([^」\n]{2,120})」|《([^》\n]{2,120})》|“([^”\n]{2,120})”|"([^"\n]{2,120})"/gu,
    )) {
      const name = match.slice(1).find(Boolean);
      if (mentionsName(action, name) && !mentionsName(supported, name)) return true;
    }
  }
  return false;
}

// 来源身份、标题与引用由服务端绑定；模型只能选择来源 key 和原文中存在的短引文。
export function resolveAdvice(proposal, evidence, body = []) {
  if (proposal == null) return null;
  if (
    !proposal ||
    typeof proposal !== 'object' ||
    Array.isArray(proposal) ||
    Object.keys(proposal).some((key) => !['sourceKey', 'quote', 'action'].includes(key))
  )
    throw new Error('ADVICE_SHAPE');
  const material = evidence.find((item) => item.key === proposal.sourceKey);
  const { action } = proposal;
  let quote = proposal.quote;
  // 只容忍排版空白差异，回填真实原文；不接受改写、删字或省略号拼接。
  if (material && typeof quote === 'string' && !material.excerpt.includes(quote)) {
    const compact = quote.replace(/\s/gu, '');
    const positions = [];
    for (let index = 0; index < material.excerpt.length; index++) {
      if (!/\s/u.test(material.excerpt[index])) positions.push(index);
    }
    const original = positions.map((index) => material.excerpt[index]).join('');
    const start = compact ? original.indexOf(compact) : -1;
    if (start >= 0) quote = material.excerpt.slice(positions[start], positions[start + compact.length - 1] + 1);
  }
  if (!material) throw new Error('ADVICE_SOURCE_UNKNOWN');
  if (typeof quote !== 'string' || !material.excerpt.includes(quote)) throw new Error('ADVICE_QUOTE_NOT_FOUND');
  if (typeof quote === 'string' && (quote.trim().length < 8 || quote.length > 100))
    throw new Error('ADVICE_QUOTE_LENGTH');
  if (typeof action !== 'string' || action.trim().length < 12 || action.length > 180)
    throw new Error('ADVICE_ACTION_LENGTH');
  if (
    !material ||
    typeof quote !== 'string' ||
    quote.trim().length < 8 ||
    quote.length > 100 ||
    !material.excerpt.includes(quote) ||
    typeof action !== 'string' ||
    action.trim().length < 12 ||
    action.length > 180 ||
    /https?:\/\/|\{\{|\}\}/iu.test(action)
  )
    throw new Error('ADVICE_EVIDENCE_INVALID');
  const numbers = action.match(/\d+(?:[.:/-]\d+)*/gu) || [];
  const sourceNumbers = new Set(material.excerpt.match(/\d+(?:[.:/-]\d+)*/gu) || []);
  if (numbers.some((number) => !sourceNumbers.has(number))) throw new Error('ADVICE_NUMBER_UNSUPPORTED');
  const normalized = normalize(action);
  const actionPairs = new Set([...normalized].slice(1).map((_, index) => normalized.slice(index, index + 2)));
  const repeats = (text) => {
    const original = normalize(text);
    if (original.includes(normalized)) return true;
    if (actionPairs.size < 12) return false;
    return [...actionPairs].filter((pair) => original.includes(pair)).length / actionPairs.size > 0.85;
  };
  const proposedStep = normalize(
    action.replace(/^(?:你可以|可以|建议你?|可考虑|请|please\s+|you\s+(?:can|could|should)\s+|consider\s+)\s*/iu, ''),
  );
  if (
    body.some(repeats) ||
    repeats(quote) ||
    (proposedStep.length >= 12 && normalize(material.excerpt).includes(proposedStep)) ||
    borrowsBodyIdentity(action, material, body)
  )
    return null;
  if (
    /^(?:(?:please|you|can|should|review|organize|open|check|the|these|your|resources|materials|content|suggestions|first|then|and|pending|changes)|[\s.,])+$/iu.test(
      action,
    )
  )
    return null;
  // 明确退掉只有通用操作的输出；语义上的增量价值仍由提示词与模型负责判断。
  if (
    /^(?:建议|可以|请|先|优先|及时|尽快|抽空|可先|你可以|再|并|进行|对|将|这些|资料|资源|内容|当前|待整理|待审核|的|做|一下|整理|审核|查看|打开|检查|补充标签|处理|确认|修改|，|。|\s)+$/u.test(
      action,
    )
  )
    return null;
  return { action: action.trim(), quote, source: material.source };
}
