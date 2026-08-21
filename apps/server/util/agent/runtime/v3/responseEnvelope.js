import { buildPublicAgentFactBlocks } from './factBundle.js';

const RESPONSE_ENVELOPE_VERSION = 1;

function escapeMarkdown(value) {
  return String(value || '').replace(/([\\`*_{}\[\]()#+\-.!|>])/gu, '\\$1');
}

function completenessSuffix(qualifiers = {}, english = false) {
  if (qualifiers.completeness === 'complete' || qualifiers.completeness === 'empty') {
    return english ? ' (complete)' : '（完整结果）';
  }
  if (qualifiers.completeness === 'partial' || qualifiers.projectionCompleteness === 'partial') {
    return english ? ' (partial; more results may exist)' : '（部分结果，可能仍有未返回内容）';
  }
  return english ? ' (completeness unknown)' : '（完整性未知）';
}

function renderFactBlock(block, locale) {
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  const label = escapeMarkdown(block.label || block.key || (english ? 'Result' : '结果'));
  const suffix = completenessSuffix(block.qualifiers, english);
  if (block.kind === 'count' || block.kind === 'returned_count') {
    const unit = block.unit ? ` ${escapeMarkdown(block.unit)}` : '';
    return `${label}: ${Number(block.value)}${unit}${suffix}`;
  }
  if (block.kind === 'entity_list' && Array.isArray(block.value)) {
    const items = block.value.map((item, index) => {
      const title = escapeMarkdown(item?.title || `${item?.type || 'item'} ${index + 1}`);
      const url = String(item?.url || '');
      return url && /^https?:\/\//iu.test(url) ? `${index + 1}. [${title}](<${url}>)` : `${index + 1}. ${title}`;
    });
    return [`${label}${suffix}:`, ...items].join('\n');
  }
  return `${label}: ${escapeMarkdown(typeof block.value === 'string' ? block.value : JSON.stringify(block.value))}${suffix}`;
}

export function buildAgentResponseEnvelope({ factBundle = null, prose = '', includeFacts = true } = {}) {
  const blocks = [];
  if (includeFacts) blocks.push(...buildPublicAgentFactBlocks(factBundle));
  const content = String(prose || '').trim();
  if (content) blocks.push(Object.freeze({ type: 'prose', content }));
  return Object.freeze({ schemaVersion: RESPONSE_ENVELOPE_VERSION, blocks: Object.freeze(blocks) });
}

export function renderAgentResponseEnvelope(envelope, locale = 'zh-CN') {
  return (Array.isArray(envelope?.blocks) ? envelope.blocks : [])
    .map((block) => (block?.type === 'fact' ? renderFactBlock(block, locale) : String(block?.content || '').trim()))
    .filter(Boolean)
    .join('\n\n');
}

export function renderDeterministicAgentFacts(factBundle, locale = 'zh-CN') {
  return renderAgentResponseEnvelope(buildAgentResponseEnvelope({ factBundle }), locale);
}

export const __testing = Object.freeze({ completenessSuffix, escapeMarkdown, renderFactBlock });
