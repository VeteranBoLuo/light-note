export interface AiResolvedGrounding {
  schemaVersion: 2;
  enabled: boolean;
  mode: 'current_explicit_only' | 'inherited_source_set' | 'workspace_query' | 'general_knowledge' | 'none';
  historyPolicy: 'discourse_projection_only' | 'legacy_conversation';
  allowedSourceCount: number;
  sourcesUsedCount: number;
  sourceSubsetValid: boolean;
  /** 服务端会话内短期有效的材料集合锚点；客户端不得据此拼装正文。 */
  sourceSetId?: string;
  materialMode?: 'current_explicit' | 'inherited' | 'workspace' | 'none';
}

export interface AiMaterialClarification {
  type: 'material_source_set';
  token: string;
  question: string;
  options: Array<{ ordinal: number; label: string; itemCount: number }>;
  expiresAt: string;
}

const MODES = new Set<AiResolvedGrounding['mode']>([
  'current_explicit_only',
  'inherited_source_set',
  'workspace_query',
  'general_knowledge',
  'none',
]);
const HISTORY_POLICIES = new Set<AiResolvedGrounding['historyPolicy']>([
  'discourse_projection_only',
  'legacy_conversation',
]);
const MATERIAL_MODES = new Set<NonNullable<AiResolvedGrounding['materialMode']>>([
  'current_explicit',
  'inherited',
  'workspace',
  'none',
]);

function safeCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export function normalizeAiResolvedGrounding(value: unknown): AiResolvedGrounding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const mode = String(raw.mode || '') as AiResolvedGrounding['mode'];
  const historyPolicy = String(raw.historyPolicy || '') as AiResolvedGrounding['historyPolicy'];
  if (Number(raw.schemaVersion) !== 2 || !MODES.has(mode) || !HISTORY_POLICIES.has(historyPolicy)) return undefined;
  const sourceSetId = String(raw.sourceSetId || '').trim();
  const materialMode = String(raw.materialMode || '') as NonNullable<AiResolvedGrounding['materialMode']>;
  return {
    schemaVersion: 2,
    enabled: raw.enabled === true,
    mode,
    historyPolicy,
    allowedSourceCount: safeCount(raw.allowedSourceCount),
    sourcesUsedCount: safeCount(raw.sourcesUsedCount),
    sourceSubsetValid: raw.sourceSubsetValid !== false,
    ...(sourceSetId && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sourceSetId) ? { sourceSetId } : {}),
    ...(MATERIAL_MODES.has(materialMode) ? { materialMode } : {}),
  };
}

export function normalizeAiMaterialClarification(value: unknown): AiMaterialClarification | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const token = String(raw.token || '').trim();
  const expiresAt = String(raw.expiresAt || '').trim();
  if (
    raw.type !== 'material_source_set' ||
    !/^[A-Za-z0-9_-]{40,}$/.test(token) ||
    !Number.isFinite(Date.parse(expiresAt))
  ) {
    return undefined;
  }
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map((item) => ({
      ordinal: Number(item?.ordinal),
      label: String(item?.label || '').slice(0, 80),
      itemCount: safeCount(item?.itemCount),
    }))
    .filter((item) => Number.isSafeInteger(item.ordinal) && item.ordinal > 0 && item.label)
    .slice(0, 6);
  if (options.length < 2) return undefined;
  return {
    type: 'material_source_set',
    token,
    question: String(raw.question || '').slice(0, 300),
    options,
    expiresAt,
  };
}
