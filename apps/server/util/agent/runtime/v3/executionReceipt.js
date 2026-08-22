import crypto from 'node:crypto';
import { buildPublicAgentFactBlocks } from './factBundle.js';

const RECEIPT_VERSION = 1;
const MAX_TOOLS = 24;
const MAX_IDS = 24;
const MAX_AUDIT_FACTS = 24;
const MAX_AUDIT_BYTES = 12_000;
const EVIDENCE_MODES = new Set([
  'workspace_queried',
  'current_materials_used',
  'inherited_result_set',
  'knowledge_base',
  'none',
  'tool_failed',
]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

function uniqueIds(values = []) {
  return Object.freeze(
    [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].slice(0, MAX_IDS),
  );
}

function evidenceModes({ usedTools = [], resolvedGrounding = null } = {}) {
  const modes = new Set();
  for (const tool of Array.isArray(usedTools) ? usedTools : []) {
    if (tool?.status === 'error') modes.add('tool_failed');
    if (tool?.status !== 'success') continue;
    if (tool?.scopePolicy === 'public_product') modes.add('knowledge_base');
    else if (tool?.effect === 'read') modes.add('workspace_queried');
  }
  if (resolvedGrounding?.sourcesUsedCount > 0) {
    if (resolvedGrounding.mode === 'inherited_source_set') modes.add('inherited_result_set');
    else if (resolvedGrounding.mode === 'current_explicit_only') modes.add('current_materials_used');
  }
  if (!modes.size) modes.add('none');
  return Object.freeze([...modes].filter((mode) => EVIDENCE_MODES.has(mode)));
}

function auditFacts(factBundle) {
  const output = [];
  let bytes = 0;
  for (const fact of (Array.isArray(factBundle?.facts) ? factBundle.facts : []).filter((item) => item.exact === true)) {
    const projection = Object.freeze({
      id: String(fact.id || '').slice(0, 64),
      goalId: String(fact.goalId || '').slice(0, 64),
      kind: String(fact.kind || '').slice(0, 40),
      key: String(fact.key || '').slice(0, 160),
      value: structuredClone(fact.value),
      unit: String(fact.unit || '').slice(0, 40),
      qualifiers: canonicalValue(fact.qualifiers || {}),
      evidenceRef: String(fact.evidenceRef || '').slice(0, 128),
    });
    const size = Buffer.byteLength(JSON.stringify(projection), 'utf8');
    if (output.length >= MAX_AUDIT_FACTS || bytes + size > MAX_AUDIT_BYTES) break;
    bytes += size;
    output.push(projection);
  }
  return Object.freeze(output);
}

export function buildAgentExecutionReceipt({
  runId,
  semanticDigest = '',
  executionDigest = '',
  goalStates = [],
  usedTools = [],
  resolvedGrounding = null,
  sourceSetIds = [],
  resultSetIds = [],
  artifactVersionIds = [],
  factBundle = null,
  writeCommitted = false,
  terminal = 'completed',
} = {}) {
  const executedTools = Object.freeze(
    (Array.isArray(usedTools) ? usedTools : []).slice(0, MAX_TOOLS).map((tool, index) =>
      Object.freeze({
        toolRunId: String(tool?.toolRunId || `tool-run-${index + 1}`).slice(0, 128),
        name: String(tool?.name || '').slice(0, 64),
        capabilityId: String(tool?.capabilityId || '').slice(0, 120),
        status: String(tool?.status || 'unknown').slice(0, 40),
      }),
    ),
  );
  const facts = auditFacts(factBundle);
  const receipt = {
    version: RECEIPT_VERSION,
    runId: String(runId || '').slice(0, 64),
    semanticDigest: String(semanticDigest || '').slice(0, 64),
    executionDigest: String(executionDigest || '').slice(0, 64),
    goalStates: Object.freeze(
      (Array.isArray(goalStates) ? goalStates : []).slice(0, 12).map((goal) =>
        Object.freeze({
          goalId: String(goal?.id || goal?.goalId || '').slice(0, 64),
          state: String(goal?.status || goal?.state || 'unknown').slice(0, 40),
        }),
      ),
    ),
    executedTools,
    evidenceModes: evidenceModes({ usedTools, resolvedGrounding }),
    sourceSetIds: uniqueIds(sourceSetIds),
    resultSetIds: uniqueIds(resultSetIds),
    artifactVersionIds: uniqueIds(artifactVersionIds),
    factDigest: String(factBundle?.digest || digest({ version: 1, facts: [] })),
    facts,
    writeCommitted: writeCommitted === true,
    terminal: String(terminal || 'completed').slice(0, 40),
  };
  return Object.freeze({ ...receipt, digest: digest(receipt) });
}

export function buildPublicAgentExecutionReceipt(receipt, factBundle = null) {
  if (!receipt) return null;
  const successCount = receipt.executedTools.filter((tool) => tool.status === 'success').length;
  const failedCount = receipt.executedTools.filter((tool) => tool.status === 'error').length;
  return Object.freeze({
    schemaVersion: RECEIPT_VERSION,
    runId: receipt.runId,
    terminal: receipt.terminal,
    evidenceModes: receipt.evidenceModes,
    toolSummary: Object.freeze({
      attempted: receipt.executedTools.length,
      succeeded: successCount,
      failed: failedCount,
    }),
    factDigest: receipt.factDigest,
    factBlocks: buildPublicAgentFactBlocks(factBundle),
    writeCommitted: receipt.writeCommitted,
  });
}

export const __testing = Object.freeze({ auditFacts, canonicalValue, evidenceModes });
