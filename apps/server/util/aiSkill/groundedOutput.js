import { aiSkillError } from './errors.js';
import { validateGroundedMarkdownOutput } from './outputValidator.js';

const MAX_BLOCKS = 60;
const MAX_BLOCK_CHARS = 10_000;
const CITATION_NEUTRALIZER = '\u2060';

export const GROUNDED_OUTPUT_PROTOCOL_INSTRUCTION =
  '必须且只能调用 submit_grounded_answer 一次。按语义段提交 blocks，每段填写 markdown 和支持该段的 sourceIndexes；markdown 内不要手写 [数字] 引用，引用由服务端生成。没有来源支持的事实不得写入。';

export function createGroundedAnswerTool(sourceCount) {
  const maximum = Math.max(1, Math.floor(Number(sourceCount) || 1));
  return Object.freeze({
    name: 'submit_grounded_answer',
    description: '提交由本轮来源支持的 Markdown 回答；来源标记由服务端统一渲染。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        blocks: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_BLOCKS,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              markdown: {
                type: 'string',
                maxLength: MAX_BLOCK_CHARS,
                description: '一段 Markdown 正文，不得自行写 [数字] 引用。',
              },
              sourceIndexes: {
                type: 'array',
                minItems: 1,
                maxItems: maximum,
                uniqueItems: true,
                items: { type: 'integer', minimum: 1, maximum },
              },
            },
            required: ['markdown', 'sourceIndexes'],
          },
        },
      },
      required: ['blocks'],
    },
  });
}

function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function neutralizeInlineCitations(line) {
  let result = '';
  let codeDelimiterLength = 0;
  for (let index = 0; index < line.length;) {
    if (line[index] === '`') {
      let end = index + 1;
      while (line[end] === '`') end += 1;
      const runLength = end - index;
      if (codeDelimiterLength === 0 && line.indexOf('`'.repeat(runLength), end) >= 0) {
        codeDelimiterLength = runLength;
      } else if (runLength === codeDelimiterLength) codeDelimiterLength = 0;
      result += line.slice(index, end);
      index = end;
      continue;
    }
    if (codeDelimiterLength === 0 && line[index] === '[') {
      const match = line.slice(index).match(/^\[(\d+)\]/u);
      if (match) {
        // 已转义的 \[n] 也统一去掉 Markdown 转义符，否则渲染后仍可能被引用装饰器误认。
        if (result.endsWith('\\')) result = result.slice(0, -1);
        result += `[${CITATION_NEUTRALIZER}${match[1]}]`;
        index += match[0].length;
        continue;
      }
    }
    if (codeDelimiterLength === 0 && line[index] === '&') {
      const entityMatch = line
        .slice(index)
        .match(/^(?:&#0*91;|&#x0*5b;|&(?:lbrack|lsqb);)(\d+)(?:&#0*93;|&#x0*5d;|&(?:rbrack|rsqb);)/iu);
      if (entityMatch) {
        result += `[${CITATION_NEUTRALIZER}${entityMatch[1]}]`;
        index += entityMatch[0].length;
        continue;
      }
    }
    result += line[index];
    index += 1;
  }
  return result;
}

/**
 * 模型正文中的数字方括号只能作为普通文字；代码围栏和行内代码保持原样。
 * 服务端稍后追加的未转义 [n] 才代表本轮权威来源。
 */
function neutralizeModelCitations(markdown) {
  let fence = null;
  return String(markdown || '')
    .split('\n')
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence.character &&
          marker[1].length >= fence.length &&
          !String(marker[2] || '').trim()
        ) {
          fence = null;
        }
        return line;
      }
      if (marker) {
        fence = { character: marker[1][0], length: marker[1].length };
        return line;
      }
      return neutralizeInlineCitations(line);
    })
    .join('\n');
}

export function validateGroundedAnswerArguments(args, sources = [], coverage = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || !exactKeys(args, ['blocks'])) {
    throw aiSkillError('AI_SKILL_STRUCTURED_OUTPUT_INVALID', 'AI 返回的引用协议格式无效', 502);
  }
  const blocks = args.blocks;
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > MAX_BLOCKS || !sources.length) {
    throw aiSkillError('AI_SKILL_STRUCTURED_OUTPUT_INVALID', 'AI 返回的引用协议格式无效', 502);
  }
  const rendered = blocks.map((block) => {
    if (
      !block ||
      typeof block !== 'object' ||
      Array.isArray(block) ||
      !exactKeys(block, ['markdown', 'sourceIndexes'])
    ) {
      throw aiSkillError('AI_SKILL_STRUCTURED_OUTPUT_INVALID', 'AI 返回的引用段格式无效', 502);
    }
    const markdown = typeof block.markdown === 'string' ? block.markdown.trim() : '';
    if (!markdown || markdown.length > MAX_BLOCK_CHARS) {
      throw aiSkillError('AI_SKILL_STRUCTURED_OUTPUT_INVALID', 'AI 返回的引用段正文无效', 502);
    }
    if (!Array.isArray(block.sourceIndexes) || !block.sourceIndexes.length) {
      throw aiSkillError('AI_SKILL_OUTPUT_SOURCE_REQUIRED', 'AI 回答存在没有来源支持的段落', 502);
    }
    if (block.sourceIndexes.some((index) => !Number.isSafeInteger(index))) {
      throw aiSkillError('AI_SKILL_OUTPUT_SOURCE_INVALID', 'AI 回答引用了不存在的来源', 502);
    }
    const sourceIndexes = [...new Set(block.sourceIndexes)];
    if (
      sourceIndexes.length !== block.sourceIndexes.length ||
      sourceIndexes.some((index) => index < 1 || index > sources.length)
    ) {
      throw aiSkillError('AI_SKILL_OUTPUT_SOURCE_INVALID', 'AI 回答引用了不存在的来源', 502);
    }
    return `${neutralizeModelCitations(markdown)}\n\n${sourceIndexes.map((index) => `[${index}]`).join(' ')}`;
  });
  // 来源完整性已由每块 sourceIndexes 的结构校验证明；这里用空 sources 只复用正文空值/总长门禁，
  // 避免把代码里的 arr[1] 再误判成来源标记。
  return validateGroundedMarkdownOutput({ content: rendered.join('\n\n'), sources: [], coverage });
}

export const groundedOutputInternals = Object.freeze({
  MAX_BLOCKS,
  MAX_BLOCK_CHARS,
  CITATION_NEUTRALIZER,
  neutralizeInlineCitations,
  neutralizeModelCitations,
});
