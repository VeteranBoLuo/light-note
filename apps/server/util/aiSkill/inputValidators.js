import { aiSkillError } from './errors.js';
import { extractMinimumOutputCharacters } from '../aiOutputLength.js';
import { AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS } from './limits.js';

function plainObject(value, label = 'input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw aiSkillError('AI_SKILL_INPUT_INVALID', `${label} 必须是对象`);
  }
  return value;
}

function knownKeys(value, keys) {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw aiSkillError('AI_SKILL_INPUT_UNKNOWN_FIELD', `input 包含未知字段：${unknown.join(', ')}`);
}

function question(value) {
  const normalized = String(value || '').trim();
  if (!normalized) throw aiSkillError('AI_SKILL_QUESTION_REQUIRED', '请输入要查询的问题');
  if (normalized.length > 500) throw aiSkillError('AI_SKILL_QUESTION_TOO_LONG', '问题最多 500 个字符');
  return normalized;
}

export function validateSearchAnswerInput(input) {
  const value = plainObject(input);
  knownKeys(value, ['question', 'resourceTypes']);
  const resourceTypes = value.resourceTypes == null ? [] : value.resourceTypes;
  if (!Array.isArray(resourceTypes) || resourceTypes.length > 4) {
    throw aiSkillError('AI_SKILL_RESOURCE_TYPES_INVALID', 'resourceTypes 必须是最多 4 项的数组');
  }
  const normalizedTypes = [...new Set(resourceTypes.map(String))];
  if (normalizedTypes.some((type) => !['note', 'bookmark', 'file', 'todo'].includes(type))) {
    throw aiSkillError('AI_SKILL_RESOURCE_TYPES_INVALID', 'resourceTypes 包含不支持的类型');
  }
  return Object.freeze({ question: question(value.question), resourceTypes: Object.freeze(normalizedTypes) });
}

export function validateHelpAnswerInput(input) {
  const value = plainObject(input);
  knownKeys(value, ['question']);
  return Object.freeze({ question: question(value.question) });
}

function optionalText(value, { label, maxLength, fallback = '' }) {
  const normalized = String(value ?? fallback).trim();
  if (normalized.length > maxLength) throw aiSkillError('AI_SKILL_INPUT_TOO_LONG', `${label}最多 ${maxLength} 个字符`);
  return normalized;
}

export function createResourceTaskInputValidator({
  defaultInstruction,
  questionRequired = false,
  instructionRequired = false,
  maxQuestionLength = 500,
  minTargetLength = 200,
  maxTargetLength = 10_000,
} = {}) {
  return function validateResourceTaskInput(input) {
    const value = plainObject(input);
    knownKeys(value, ['question', 'instruction', 'title', 'detailLevel', 'targetLength']);
    const normalizedQuestion = optionalText(value.question, { label: '问题', maxLength: maxQuestionLength });
    let instruction = optionalText(value.instruction, {
      label: '要求',
      maxLength: 1000,
      fallback: defaultInstruction,
    });
    if (questionRequired && !normalizedQuestion) throw aiSkillError('AI_SKILL_QUESTION_REQUIRED', '请输入要查询的问题');
    if (instructionRequired && !instruction) throw aiSkillError('AI_SKILL_INSTRUCTION_REQUIRED', '请输入处理要求');
    if (!instruction) instruction = defaultInstruction || normalizedQuestion;
    const detailLevel = String(value.detailLevel || 'balanced').trim();
    if (!['concise', 'balanced', 'detailed'].includes(detailLevel)) {
      throw aiSkillError('AI_SKILL_DETAIL_LEVEL_INVALID', 'detailLevel 仅支持 concise、balanced 或 detailed');
    }
    let targetLength = extractMinimumOutputCharacters(`${normalizedQuestion}\n${instruction}`);
    if (value.targetLength != null && value.targetLength !== '') {
      targetLength = Number(value.targetLength);
    }
    if (
      targetLength != null &&
      (!Number.isSafeInteger(targetLength) || targetLength < minTargetLength || targetLength > maxTargetLength)
    ) {
      throw aiSkillError(
        'AI_SKILL_TARGET_LENGTH_INVALID',
        `目标长度必须是 ${minTargetLength}～${maxTargetLength} 之间的整数`,
      );
    }
    return Object.freeze({
      question: normalizedQuestion,
      instruction,
      title: optionalText(value.title, { label: '标题', maxLength: 200 }),
      detailLevel,
      targetLength,
    });
  };
}

export function validateTodoDraftInput(input) {
  const value = plainObject(input);
  knownKeys(value, ['instruction']);
  const instruction = optionalText(value.instruction, { label: '待办描述', maxLength: 1000 });
  if (!instruction) throw aiSkillError('AI_SKILL_INSTRUCTION_REQUIRED', '请输入要创建或拆解的待办');
  return Object.freeze({ instruction });
}

export function validateTodoBreakdownInput(input) {
  const value = plainObject(input);
  knownKeys(value, ['instruction', 'detailLevel']);
  const instruction = optionalText(value.instruction, { label: '待办描述', maxLength: 1000 });
  if (!instruction) throw aiSkillError('AI_SKILL_INSTRUCTION_REQUIRED', '请输入要拆解的待办');
  const detailLevel = String(value.detailLevel || 'concise').trim();
  if (!['concise', 'detailed'].includes(detailLevel)) {
    throw aiSkillError('AI_SKILL_TODO_DETAIL_LEVEL_INVALID', '不支持该待办拆解粒度');
  }
  return Object.freeze({ instruction, detailLevel });
}

const NOTE_TRANSFORM_OPERATIONS = new Set([
  'polish',
  'rewrite',
  'summarize',
  'expand',
  'proofread',
  'title',
  'outline',
  'translate',
]);

export function validateNoteTransformInput(input) {
  const value = plainObject(input);
  knownKeys(value, ['text', 'operation', 'instruction', 'targetLanguage', 'targetLength']);
  const text = String(value.text || '').trim();
  if (!text) throw aiSkillError('AI_SKILL_TEXT_REQUIRED', '请选择或输入要处理的文字');
  if (text.length > AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS) {
    throw aiSkillError('AI_SKILL_TEXT_TOO_LONG', `单次最多处理 ${AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS} 个字符`);
  }
  const operation = String(value.operation || '').trim();
  if (!NOTE_TRANSFORM_OPERATIONS.has(operation)) {
    throw aiSkillError('AI_SKILL_NOTE_OPERATION_INVALID', '不支持该笔记处理方式');
  }
  const instruction = optionalText(value.instruction, { label: '补充要求', maxLength: 1000 });
  const targetLanguage = optionalText(value.targetLanguage, { label: '目标语言', maxLength: 40 });
  if (operation === 'translate' && !targetLanguage) {
    throw aiSkillError('AI_SKILL_TARGET_LANGUAGE_REQUIRED', '请选择翻译目标语言');
  }
  let targetLength = extractMinimumOutputCharacters(instruction);
  if (value.targetLength != null && value.targetLength !== '') {
    targetLength = Number(value.targetLength);
  }
  if (targetLength != null && (!Number.isSafeInteger(targetLength) || targetLength < 50 || targetLength > 10_000)) {
    throw aiSkillError('AI_SKILL_TARGET_LENGTH_INVALID', '目标长度必须是 50～10000 之间的整数');
  }
  return Object.freeze({ text, operation, instruction, targetLanguage, targetLength });
}

export function validateBookmarkParseInput(input) {
  const value = plainObject(input);
  knownKeys(value, ['url', 'pageContext']);
  const url = optionalText(value.url, { label: '网址', maxLength: 2000 });
  if (!url) throw aiSkillError('AI_SKILL_BOOKMARK_URL_REQUIRED', '请输入要识别的网址');
  let pageContext = null;
  if (value.pageContext != null) {
    const context = plainObject(value.pageContext, 'pageContext');
    knownKeys(context, ['url', 'title', 'text']);
    const contextUrl = optionalText(context.url, { label: '当前页网址', maxLength: 2000 });
    const title = optionalText(context.title, { label: '当前页标题', maxLength: 500 });
    const text = optionalText(context.text, { label: '当前页可见文字', maxLength: 12_000 });
    if (!contextUrl) throw aiSkillError('AI_SKILL_BOOKMARK_CONTEXT_URL_REQUIRED', '当前页上下文缺少网址');
    if (!title && !text) throw aiSkillError('AI_SKILL_BOOKMARK_CONTEXT_EMPTY', '当前页上下文没有可识别内容');
    pageContext = Object.freeze({ url: contextUrl, title, text });
  }
  return Object.freeze({ url, pageContext });
}

export const aiSkillInputValidatorInternals = Object.freeze({ NOTE_TRANSFORM_OPERATIONS });
