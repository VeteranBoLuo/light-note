import crypto from 'crypto';

const IDEMPOTENT_TOOL_NAMES = new Set(['create_note', 'create_image_note']);
const KEY_PREFIX = 'agent-write-v1:';

function normalizedText(value) {
  return String(value || '').trim().normalize('NFC');
}

function keyPayload({ toolName, args = {}, context = {} }) {
  if (!IDEMPOTENT_TOOL_NAMES.has(toolName) || !context.resourceUserId) {
    return null;
  }

  if (toolName === 'create_note') {
    return {
      toolName,
      userId: String(context.resourceUserId),
      sessionId: normalizedText(context.sessionId),
      title: normalizedText(args.title),
      content: normalizedText(args.content),
      type: normalizedText(args.type || 'markdown'),
    };
  }

  const attachmentId = normalizedText(args.attachmentId);
  if (!attachmentId) return null;
  return {
    toolName,
    userId: String(context.resourceUserId),
    sessionId: normalizedText(context.sessionId),
    attachmentId,
    title: normalizedText(args.title),
    description: normalizedText(args.description),
  };
}

export function createAgentActionIdempotencyKey(input) {
  const payload = keyPayload(input);
  if (!payload) return null;
  return `${KEY_PREFIX}${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

export function actionIdempotencyUuid(idempotencyKey, namespace = 'note') {
  if (!idempotencyKey) return null;
  const bytes = crypto
    .createHash('sha256')
    .update(`${namespace}:${idempotencyKey}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function actionIdempotencyImageFileName(idempotencyKey, extension) {
  if (!idempotencyKey) return null;
  const digest = crypto.createHash('sha256').update(`image:${idempotencyKey}`).digest('hex').slice(0, 32);
  return `note-ai-${digest}${extension}`;
}
