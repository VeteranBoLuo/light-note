import { createHash } from 'node:crypto';
import { EXTRACTION_LIMITS } from '@lightnote/shared/extraction';
import { toolboxError } from '../toolbox/errors.js';
import { validatePlan } from './contract.js';
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const json = (value, fallback = null) => (typeof value === 'string' ? JSON.parse(value) : (value ?? fallback));
export const fail = (code, message, status = 400) => {
  throw toolboxError(`EXTRACTION_${code}`, message, status);
};
export function requestId(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    fail('REQUEST_INVALID', '请求身份无效');
  return value;
}
export function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    fail('INPUT_INVALID', '输入内容无效或超过限制');
  return value;
}
export function normalizePlan(value) {
  try {
    return validatePlan({
      recordDefinition: value.recordDefinition,
      fields: value.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, rule: f.rule })),
    });
  } catch {
    fail('PLAN_INVALID', '记录定义或字段无效，请检查重复字段及字段类型');
  }
}
export function planIdentity(plan) {
  // Display-name edits do not invalidate paid samples. Order/rules/types do.
  return digest({
    recordDefinition: plan.recordDefinition,
    fields: plan.fields.map(({ key, type, rule }) => ({ key, type, rule })),
  });
}
export function assertVersion(current, expected) {
  if (!Number.isSafeInteger(expected) || expected !== Number(current))
    fail('VERSION_CONFLICT', '数据已变化，请保留当前输入并重新加载', 409);
}
export function reviewRecord(record, input, now = new Date().toISOString()) {
  assertVersion(record.version, input.version);
  if (input.action === 'exclude') {
    if (typeof input.excluded !== 'boolean') fail('INPUT_INVALID', '排除状态无效');
    return { ...record, excluded: input.excluded, version: record.version + 1 };
  }
  if (!record.cells.some((c) => c.fieldId === input.fieldId) || !['review', 'restore'].includes(input.action))
    fail('FIELD_INVALID', '字段或核对操作无效');
  const review =
    input.action === 'restore'
      ? { overridden: false, value: '', checked: false, updatedAt: now }
      : {
          overridden: true,
          value: text(input.value, EXTRACTION_LIMITS.cellCharacters),
          checked: input.checked === true,
          updatedAt: now,
        };
  return { ...record, reviews: { ...record.reviews, [input.fieldId]: review }, version: record.version + 1 };
}
// Only identical source anchors reach this path. Keep every differing value and
// its own validated evidence, without changing a user's override.
export function mergeBoundaryRecord(original, incoming, reviews = {}) {
  const nextReviews = { ...reviews };
  const cells = original.cells.map((cell) => {
    const candidate = incoming.cells.find((value) => value.fieldId === cell.fieldId);
    if (!candidate || candidate.originalValue === cell.originalValue) return cell;
    const alternative = { value: candidate.originalValue, status: candidate.status, evidence: candidate.evidence };
    const alternatives = [...(cell.alternatives || [])];
    if (alternatives.some((value) => digest(value) === digest(alternative))) return cell;
    alternatives.push(alternative);
    if (nextReviews[cell.fieldId]?.checked)
      nextReviews[cell.fieldId] = { ...nextReviews[cell.fieldId], checked: false };
    return {
      ...cell,
      status: 'conflict',
      alternatives,
      evidenceIssues: [...new Set([...cell.evidenceIssues, 'boundary_disagreement'])],
    };
  });
  return { payload: { ...original, cells }, reviews: nextReviews };
}
export function materialRefs(refs) {
  if (!Array.isArray(refs) || !refs.length || refs.length > EXTRACTION_LIMITS.sources)
    fail('SOURCES_INVALID', '每次请选择 1–20 份资料');
  const seen = new Set();
  return refs.map((ref) => {
    if (
      !ref ||
      !['note', 'bookmark', 'file'].includes(ref.type) ||
      typeof ref.id !== 'string' ||
      !/^[A-Za-z0-9._:@/-]{1,128}$/.test(ref.id)
    )
      fail('SOURCE_INVALID', '资料引用无效');
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) fail('SOURCE_DUPLICATE', '同一份资料不能重复选择');
    seen.add(key);
    return { type: ref.type, id: ref.id, ...(ref.version ? { version: text(ref.version, 128) } : {}) };
  });
}
