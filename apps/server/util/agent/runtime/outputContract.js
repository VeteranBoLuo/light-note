const DEFAULT_GROWTH_RATIO = 0.4;
const DEFAULT_GROWTH_CHARS = 300;
const DEFAULT_LENGTH_TOLERANCE = 0.1;
const DEFAULT_MAX_GROUNDED_EXPANSION_RATIO = 6;
const DEFAULT_GROUNDED_EXPANSION_ALLOWANCE = 800;

const RELATIVE_GROWTH_PATTERN =
  /(?:太|有点|比较)?(?:短|少|简略)|不够(?:长|详细|完整|丰富)|写(?:得|的)?(?:长|多|详细|完整|丰富)(?:一|点|些)?|(?:更|再)(?:长|详细|完整|丰富)(?:一|点|些)?|扩写|展开|补充|\b(?:longer|expand|more\s+detail|elaborate)\b/i;
const PRESERVE_LENGTH_PATTERN =
  /(?:只|仅)?(?:润色|优化|校对).{0,16}(?:不(?:要|改变|增加|减少)|保持|维持).{0,8}(?:字数|长度)|(?:不(?:要|改变|增加|减少)|保持|维持).{0,8}(?:字数|长度).{0,16}(?:润色|优化|校对)|\b(?:polish|proofread).{0,24}(?:same|preserve|without\s+changing).{0,12}(?:length|word\s+count)\b/i;
const MATERIAL_ONLY_PATTERN =
  /(?:(?:仅|只)(?:能|可|需|要)?(?:根据|依据|基于|使用|围绕|结合).{0,12}(?:这些|上述|所选|给定|提供的)?(?:材料|资料|内容|原文)|不得(?:使用|加入|添加|引入).{0,12}(?:外部|材料外|资料外|额外).{0,8}(?:知识|信息|内容)|\b(?:only|solely|exclusively)\s+(?:use|using|based\s+on).{0,40}(?:materials?|sources?|provided\s+content)\b)/i;

function normalizeLengthText(value) {
  return String(value || '')
    .replace(/[０-９]/g, (character) => String(character.charCodeAt(0) - 0xfee0))
    .replace(/[，,]/g, '')
    .trim();
}

function scaledLengthValue(rawValue, rawScale = '') {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const scale = String(rawScale || '').toLowerCase();
  const multiplier = scale === '万' ? 10_000 : scale === '千' || scale === 'k' ? 1_000 : 1;
  return Math.ceil(numeric * multiplier);
}

function boundedRatio(value, fallback, { min = 0, max = 2 } = {}) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function boundedCount(value, fallback, { min = 0, max = 10_000 } = {}) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.ceil(numeric))) : fallback;
}

export function countOutputCharacters(content) {
  return String(content || '').trim().length;
}

export function extractMinimumOutputCharacters(instruction) {
  const text = normalizeLengthText(instruction);
  if (!text) return null;
  const candidates = [];
  const patterns = [
    /(?:至少|最少|不少于|不低于|不得少于|不能少于|起码)\s*(?:写(?:到)?|达到|有|为)?\s*(\d+(?:\.\d+)?)\s*(万|千|k)?\s*(?:个\s*)?(?:字|字符)/gi,
    /(\d+(?:\.\d+)?)\s*(万|千|k)?\s*(?:个\s*)?(?:字|字符)\s*(?:以上|起步|起|打底)/gi,
    /\bat\s+least\s+(\d+(?:\.\d+)?)\s*(k)?\s*(?:characters?|chars?)\b/gi,
    /\bminimum(?:\s+of)?\s+(\d+(?:\.\d+)?)\s*(k)?\s*(?:characters?|chars?)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = scaledLengthValue(match[1], match[2]);
      if (value > 0) candidates.push(value);
    }
  }
  return candidates.length ? Math.max(...candidates) : null;
}

function extractTargetRange(instruction) {
  const text = normalizeLengthText(instruction);
  const rangePatterns = [
    /(?:控制在|保持在|写(?:到|成)?|正文)?\s*(\d+(?:\.\d+)?)\s*(万|千|k)?\s*(?:到|至|[-~～—])\s*(\d+(?:\.\d+)?)\s*(万|千|k)?\s*(?:个\s*)?(?:字|字符)/i,
    /\b(?:between\s+)?(\d+(?:\.\d+)?)\s*(k)?\s*(?:and|to|[-–—])\s*(\d+(?:\.\d+)?)\s*(k)?\s*(?:characters?|chars?)\b/i,
  ];
  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const first = scaledLengthValue(match[1], match[2]);
    const second = scaledLengthValue(match[3], match[4]);
    if (first > 0 && second > 0 && first !== second) {
      return { targetMinChars: Math.min(first, second), targetMaxChars: Math.max(first, second) };
    }
  }
  const aboutPatterns = [
    /(?:大约|约|差不多|控制在)\s*(\d+(?:\.\d+)?)\s*(万|千|k)?\s*(?:个\s*)?(?:字|字符)(?:左右)?/i,
    /(\d+(?:\.\d+)?)\s*(万|千|k)?\s*(?:个\s*)?(?:字|字符)\s*左右/i,
    /\b(?:about|around|approximately)\s+(\d+(?:\.\d+)?)\s*(k)?\s*(?:characters?|chars?)\b/i,
  ];
  for (const pattern of aboutPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const target = scaledLengthValue(match[1], match[2]);
    if (target > 0) {
      return { targetMinChars: Math.floor(target * 0.9), targetMaxChars: Math.ceil(target * 1.15) };
    }
  }
  return null;
}

function extractMinimumSections(instruction) {
  const text = String(instruction || '');
  const match = text.match(
    /(?:分成|分为|写成|整理成)\s*([一二三四五六七八九十]|\d+)\s*(?:个\s*)?(?:段|部分|章节|小节)/u,
  );
  if (!match) return null;
  const chinese = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const count = Number(match[1]) || chinese[match[1]] || 0;
  return count >= 2 && count <= 20 ? count : null;
}

export function isRelativeGrowthInstruction(instruction) {
  return RELATIVE_GROWTH_PATTERN.test(String(instruction || ''));
}

export function compileNoteDraftOutputContract({ instruction, previousContent = '', env = process.env } = {}) {
  const previousChars = countOutputCharacters(previousContent);
  const minimum = extractMinimumOutputCharacters(instruction);
  const range = extractTargetRange(instruction);
  const preserveLength = previousChars > 0 && PRESERVE_LENGTH_PATTERN.test(String(instruction || ''));
  const relativeGrowth = previousChars > 0 && isRelativeGrowthInstruction(instruction);
  const minGrowthRatio = boundedRatio(env.AI_NOTE_DRAFT_MIN_GROWTH_RATIO, DEFAULT_GROWTH_RATIO, {
    min: 0.1,
    max: 1,
  });
  const minGrowthChars = boundedCount(env.AI_NOTE_DRAFT_MIN_GROWTH_CHARS, DEFAULT_GROWTH_CHARS, {
    min: 50,
    max: 5_000,
  });
  const toleranceRatio = boundedRatio(env.AI_NOTE_DRAFT_LENGTH_TOLERANCE_RATIO, DEFAULT_LENGTH_TOLERANCE, {
    min: 0.02,
    max: 0.3,
  });

  let length = { mode: 'unspecified' };
  if (range) length = { mode: 'target_range', ...range };
  else if (minimum) length = { mode: 'minimum', minChars: minimum };
  else if (preserveLength) length = { mode: 'preserve_length', toleranceRatio };
  else if (relativeGrowth) length = { mode: 'relative_growth', minGrowthRatio, minGrowthChars };

  return Object.freeze({
    language: /\b(?:english|in english)\b/i.test(String(instruction || '')) ? 'en' : 'auto',
    format: 'note_markdown',
    length: Object.freeze(length),
    structure: Object.freeze({
      requiredHeadings: Object.freeze([]),
      minimumSections: extractMinimumSections(instruction),
    }),
    content: Object.freeze({
      mustPreserve: Object.freeze([]),
      mustInclude: Object.freeze([]),
      mustAvoid: Object.freeze([]),
      groundingRequired: true,
      allowGeneralKnowledge: !MATERIAL_ONLY_PATTERN.test(String(instruction || '')),
    }),
    revision: previousChars ? Object.freeze({ preserveFacts: true, preserveLinks: true, previousChars }) : undefined,
  });
}

export function assessGroundingCapacity({ contract, sourceChars = 0, env = process.env } = {}) {
  const requiredMinChars = requiredMinimumCharacters(contract);
  const normalizedSourceChars = Math.max(0, Number(sourceChars) || 0);
  if (!requiredMinChars || contract?.content?.allowGeneralKnowledge !== false) {
    return { valid: true, requiredMinChars, sourceChars: normalizedSourceChars, maximumSupportedChars: null };
  }
  const maxExpansionRatio = boundedRatio(
    env.AI_NOTE_DRAFT_MAX_GROUNDED_EXPANSION_RATIO,
    DEFAULT_MAX_GROUNDED_EXPANSION_RATIO,
    { min: 1, max: 20 },
  );
  const expansionAllowance = boundedCount(
    env.AI_NOTE_DRAFT_GROUNDED_EXPANSION_ALLOWANCE,
    DEFAULT_GROUNDED_EXPANSION_ALLOWANCE,
    { min: 0, max: 5_000 },
  );
  const maximumSupportedChars = Math.ceil(normalizedSourceChars * maxExpansionRatio + expansionAllowance);
  return {
    valid: requiredMinChars <= maximumSupportedChars,
    requiredMinChars,
    sourceChars: normalizedSourceChars,
    maximumSupportedChars,
    maxExpansionRatio,
    expansionAllowance,
  };
}

export function requiredMinimumCharacters(contract) {
  const length = contract?.length || {};
  if (length.mode === 'minimum') return Number(length.minChars) || null;
  if (length.mode === 'target_range') return Number(length.targetMinChars) || null;
  if (length.mode === 'relative_growth') {
    const previous = Number(contract?.revision?.previousChars) || 0;
    if (!previous) return null;
    return Math.max(
      Math.ceil(previous * (1 + Number(length.minGrowthRatio || DEFAULT_GROWTH_RATIO))),
      previous + Number(length.minGrowthChars || DEFAULT_GROWTH_CHARS),
    );
  }
  if (length.mode === 'preserve_length') {
    const previous = Number(contract?.revision?.previousChars) || 0;
    return previous ? Math.floor(previous * (1 - Number(length.toleranceRatio || DEFAULT_LENGTH_TOLERANCE))) : null;
  }
  return null;
}

export function allowedMaximumCharacters(contract) {
  const length = contract?.length || {};
  if (length.mode === 'target_range') return Number(length.targetMaxChars) || null;
  if (length.mode === 'preserve_length') {
    const previous = Number(contract?.revision?.previousChars) || 0;
    return previous ? Math.ceil(previous * (1 + Number(length.toleranceRatio || DEFAULT_LENGTH_TOLERANCE))) : null;
  }
  return null;
}

function countSections(content) {
  return String(content || '')
    .trim()
    .split(/\n\s*\n/u)
    .map((item) => item.replace(/^#{1,6}\s+/u, '').trim())
    .filter(Boolean).length;
}

function hasRepeatedPadding(content) {
  const paragraphs = String(content || '')
    .split(/\n\s*\n/u)
    .map((item) =>
      item
        .replace(/^#{1,6}\s+/u, '')
        .replace(/\s+/gu, '')
        .trim(),
    )
    .filter((item) => item.length >= 50);
  if (paragraphs.length < 3) return false;
  const counts = new Map();
  for (const paragraph of paragraphs) counts.set(paragraph, (counts.get(paragraph) || 0) + 1);
  return [...counts.values()].some((count) => count >= 2 && count / paragraphs.length >= 0.25);
}

function extractLinks(content) {
  return [...new Set(String(content || '').match(/https?:\/\/[^\s)\]}>"']+/giu) || [])];
}

export function validateNoteDraftOutput({ content, contract, previousContent = '' } = {}) {
  const actualChars = countOutputCharacters(content);
  const previousChars = countOutputCharacters(previousContent);
  const minChars = requiredMinimumCharacters(contract);
  const maxChars = allowedMaximumCharacters(contract);
  const issues = [];
  if (minChars && actualChars < minChars) {
    issues.push(
      contract?.length?.mode === 'relative_growth'
        ? 'relative_growth_insufficient'
        : contract?.length?.mode === 'minimum'
          ? 'length_below_minimum'
          : 'length_outside_range',
    );
  }
  if (maxChars && actualChars > maxChars) issues.push('length_outside_range');
  if (contract?.structure?.minimumSections && countSections(content) < contract.structure.minimumSections) {
    issues.push('required_section_missing');
  }
  if (/<\/?(?:html|body|div|p|h[1-6]|ul|ol|li|table|tr|td)\b[^>]*>/iu.test(String(content || ''))) {
    issues.push('format_mismatch');
  }
  const previousLinks = extractLinks(previousContent);
  if (contract?.revision?.preserveLinks && previousLinks.some((link) => !String(content || '').includes(link))) {
    issues.push('required_fact_missing');
  }
  if (hasRepeatedPadding(content)) issues.push('repeated_content_padding');
  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    measurements: {
      lengthMode: contract?.length?.mode || 'unspecified',
      requiredMinChars: minChars,
      allowedMaxChars: maxChars,
      previousChars: previousChars || null,
      actualChars,
      growthRatio: previousChars > 0 ? actualChars / previousChars : null,
      minimumSections: contract?.structure?.minimumSections || null,
    },
  };
}

export function buildOutputContractInstruction(contract) {
  const minChars = requiredMinimumCharacters(contract);
  const maxChars = allowedMaximumCharacters(contract);
  const instructions = [];
  if (contract?.length?.mode === 'minimum') instructions.push(`Markdown 正文必须至少 ${minChars} 字`);
  if (contract?.length?.mode === 'target_range')
    instructions.push(`Markdown 正文必须在 ${minChars}～${maxChars} 字之间`);
  if (contract?.length?.mode === 'relative_growth') instructions.push(`改写后的完整正文必须至少 ${minChars} 字`);
  if (contract?.length?.mode === 'preserve_length')
    instructions.push(`润色后的完整正文必须保持在 ${minChars}～${maxChars} 字之间`);
  if (contract?.structure?.minimumSections)
    instructions.push(`正文至少包含 ${contract.structure.minimumSections} 个清晰段落或章节`);
  instructions.push('输出必须是 Markdown，不得返回 HTML；不得用重复段落凑字数');
  return instructions.join('；') + '。';
}

export function buildOutputRepairReason(validation) {
  const { measurements = {}, issues = [] } = validation || {};
  const details = [];
  if (issues.includes('length_below_minimum')) {
    details.push(`正文当前约 ${measurements.actualChars} 字，低于要求的 ${measurements.requiredMinChars} 字`);
  }
  if (issues.includes('relative_growth_insufficient')) {
    details.push(
      `正文当前约 ${measurements.actualChars} 字，扩写目标至少 ${measurements.requiredMinChars} 字（上一版约 ${measurements.previousChars} 字）`,
    );
  }
  if (issues.includes('length_outside_range')) {
    details.push(
      `正文当前约 ${measurements.actualChars} 字，要求范围为 ${measurements.requiredMinChars}～${measurements.allowedMaxChars} 字`,
    );
  }
  if (issues.includes('required_section_missing')) details.push('正文没有达到要求的段落或章节数量');
  if (issues.includes('format_mismatch')) details.push('正文包含 HTML，必须改为 Markdown');
  if (issues.includes('required_fact_missing')) details.push('改写时丢失了上一版中的有效链接');
  if (issues.includes('repeated_content_padding')) details.push('正文存在重复段落凑字数');
  return details.join('；') || '输出没有通过契约校验';
}
