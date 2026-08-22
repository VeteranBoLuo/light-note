export type AiExecutionEvidenceMode =
  'workspace_queried' | 'current_materials_used' | 'inherited_result_set' | 'knowledge_base' | 'none' | 'tool_failed';

export interface AiFactBlock {
  type: 'fact';
  factId: string;
  kind: string;
  key: string;
  value: unknown;
  unit: string;
  label: string;
  qualifiers: Record<string, unknown>;
}

export interface AiExecutionReceipt {
  schemaVersion: 1;
  runId: string;
  terminal: string;
  evidenceModes: AiExecutionEvidenceMode[];
  toolSummary: { attempted: number; succeeded: number; failed: number };
  factDigest: string;
  factBlocks: AiFactBlock[];
  writeCommitted: boolean;
}

export interface AiResponseEnvelope {
  schemaVersion: 1;
  blocks: Array<AiFactBlock | { type: 'prose'; content: string }>;
}

export type AiExecutionReceiptNoticeKey =
  'currentMaterials' | 'inheritedResult' | 'knowledgeBase' | 'workspaceQueried' | 'toolFailed';

const EVIDENCE_MODES = new Set<AiExecutionEvidenceMode>([
  'workspace_queried',
  'current_materials_used',
  'inherited_result_set',
  'knowledge_base',
  'none',
  'tool_failed',
]);

function safeCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function safeClone(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeFactBlock(value: unknown): AiFactBlock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== 'fact') return null;
  const factId = String(raw.factId || '')
    .trim()
    .slice(0, 64);
  const kind = String(raw.kind || '')
    .trim()
    .slice(0, 40);
  const key = String(raw.key || '')
    .trim()
    .slice(0, 160);
  if (!factId || !kind || !key) return null;
  return {
    type: 'fact',
    factId,
    kind,
    key,
    value: safeClone(raw.value),
    unit: String(raw.unit || '').slice(0, 40),
    label: String(raw.label || '').slice(0, 160),
    qualifiers:
      raw.qualifiers && typeof raw.qualifiers === 'object' && !Array.isArray(raw.qualifiers)
        ? (safeClone(raw.qualifiers) as Record<string, unknown>) || {}
        : {},
  };
}

export function normalizeAiExecutionReceipt(value: unknown): AiExecutionReceipt | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (Number(raw.schemaVersion) !== 1) return undefined;
  const runId = String(raw.runId || '')
    .trim()
    .slice(0, 64);
  const factDigest = String(raw.factDigest || '').trim();
  if (!runId || !/^[0-9a-f]{64}$/iu.test(factDigest)) return undefined;
  const rawToolSummary =
    raw.toolSummary && typeof raw.toolSummary === 'object' && !Array.isArray(raw.toolSummary)
      ? (raw.toolSummary as Record<string, unknown>)
      : {};
  const evidenceModes = [
    ...new Set(
      (Array.isArray(raw.evidenceModes) ? raw.evidenceModes : [])
        .map((mode) => String(mode) as AiExecutionEvidenceMode)
        .filter((mode) => EVIDENCE_MODES.has(mode)),
    ),
  ];
  return {
    schemaVersion: 1,
    runId,
    terminal: String(raw.terminal || '').slice(0, 40),
    evidenceModes: evidenceModes.length ? evidenceModes : ['none'],
    toolSummary: {
      attempted: safeCount(rawToolSummary.attempted),
      succeeded: safeCount(rawToolSummary.succeeded),
      failed: safeCount(rawToolSummary.failed),
    },
    factDigest,
    factBlocks: (Array.isArray(raw.factBlocks) ? raw.factBlocks : [])
      .map(normalizeFactBlock)
      .filter((block): block is AiFactBlock => Boolean(block))
      .slice(0, 80),
    writeCommitted: raw.writeCommitted === true,
  };
}

export function normalizeAiResponseEnvelope(value: unknown): AiResponseEnvelope | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (Number(raw.schemaVersion) !== 1 || !Array.isArray(raw.blocks)) return undefined;
  const blocks = raw.blocks
    .map((block) => {
      const fact = normalizeFactBlock(block);
      if (fact) return fact;
      if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
      const record = block as Record<string, unknown>;
      if (record.type !== 'prose') return null;
      const content = String(record.content || '')
        .trim()
        .slice(0, 120_000);
      return content ? ({ type: 'prose', content } as const) : null;
    })
    .filter((block): block is AiResponseEnvelope['blocks'][number] => Boolean(block))
    .slice(0, 100);
  return { schemaVersion: 1, blocks };
}

/**
 * 只根据服务端真实执行回执决定是否显示处理口径；没有成功检索或真实材料时返回空，
 * 不能再从用户问题、模型文案、来源标签或卡片存在推断“本轮已检索”。
 */
export function resolveAiExecutionReceiptNoticeKey(
  receipt?: AiExecutionReceipt,
): AiExecutionReceiptNoticeKey | undefined {
  if (!receipt) return undefined;
  const modes = new Set(receipt.evidenceModes);
  if (modes.has('current_materials_used')) return 'currentMaterials';
  if (modes.has('inherited_result_set')) return 'inheritedResult';
  if (modes.has('knowledge_base')) return 'knowledgeBase';
  if (modes.has('workspace_queried') && receipt.toolSummary.succeeded > 0) return 'workspaceQueried';
  if (modes.has('tool_failed') && receipt.toolSummary.succeeded === 0) return 'toolFailed';
  return undefined;
}
