import { AI_DOCUMENT_SUMMARY_MAX_CHARS } from '@lightnote/shared/ai-skill-protocol';
import { validatePushSubscription } from '../browserPushPolicy.js';
import { MAX_BOOKMARK_INPUT_LENGTH } from '@lightnote/shared';
import { DRAWING_SCENE_MAX_BYTES } from '@lightnote/shared/drawing-note';
import {
  DRAWING_THUMBNAIL_MAX_BYTES,
  NOTE_CONTENT_MAX_LENGTH,
  NOTE_EXPORT_MAX_BYTES,
  ORGANIZE_SELECTED_ITEMS_MAX_COUNT,
  ORGANIZE_RESOURCE_ID_MAX_LENGTH,
  TAG_ICON_MAX_SVG_BYTES,
} from '../contentLimits.js';
import { AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS } from '../aiSkill/limits.js';

const WEBP_DATA_URL_PREFIX = 'data:image/webp;base64,';
const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;base64,';
const BASE64_PAYLOAD_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/u;
const NO_SIGNATURE_RULE_EXEMPTIONS = Object.freeze([]);
const DAILY_REVIEW_ITEM_ACTIONS = new Set(['open', 'open_tag_space', 'snooze_7d', 'dismiss']);
const DAILY_REVIEW_SESSION_ACTIONS = new Set(['skip_today', 'resume_today']);
const ORGANIZE_RESOURCE_TYPES = new Set(['bookmark', 'note', 'file', 'tag']);

const utf8Length = (value) => Buffer.byteLength(String(value ?? ''), 'utf8');

const isBase64Payload = (value) =>
  typeof value === 'string' && value.length > 0 && value.length % 4 !== 1 && BASE64_PAYLOAD_PATTERN.test(value);

const base64DecodedLength = (value) => {
  const payload = String(value || '');
  if (!payload) return 0;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
};

const isDataUrl = (value, prefix) =>
  typeof value === 'string' && value.startsWith(prefix) && isBase64Payload(value.slice(prefix.length));

const policy = ({
  semantic,
  maxSize,
  sizeUnit = 'characters',
  accepts = (value) => typeof value === 'string',
  measure = (value) => String(value ?? '').length,
  skipSignatureRules = NO_SIGNATURE_RULE_EXEMPTIONS,
  fallbackContext = null,
}) => Object.freeze({ semantic, maxSize, sizeUnit, accepts, measure, skipSignatureRules, fallbackContext });

// 这里只声明“通用安全检测如何理解字段”，不取代业务 handler 的权威内容校验。
// 路由、字段、语义和容量预算必须一起命中；形态不符或超限时仍回到通用签名/异常检测。
const REQUEST_FIELD_POLICIES = new Map([
  [
    'POST /organize/suggestions/previews',
    new Map([
      [
        'body.items',
        policy({
          semantic: 'organize-selected-items',
          maxSize: ORGANIZE_SELECTED_ITEMS_MAX_COUNT,
          sizeUnit: 'items',
          measure: (value) => (Array.isArray(value) ? value.length : 0),
          accepts: (value, context) =>
            context.body?.scope === 'selected' &&
            Array.isArray(context.body?.resourceTypes) &&
            value.length > 0 &&
            value.every(
              (item) =>
                item &&
                typeof item === 'object' &&
                !Array.isArray(item) &&
                Object.keys(item).every((key) => ['id', 'type'].includes(key)) &&
                ORGANIZE_RESOURCE_TYPES.has(item.type) &&
                context.body.resourceTypes.includes(item.type) &&
                typeof item.id === 'string' &&
                item.id.length > 0 &&
                item.id.length <= ORGANIZE_RESOURCE_ID_MAX_LENGTH,
            ),
        }),
      ],
    ]),
  ],
  [
    'POST /note/imports/start',
    new Map(
      Array.from({ length: 200 }, (_, i) => [
        `body.items.${i}.title`,
        policy({ semantic: 'note-import-title', maxSize: 255, skipSignatureRules: '*' }),
      ]),
    ),
  ],
  [
    'POST /notification/browser/subscribe',
    new Map([
      [
        'body.subscription.endpoint',
        policy({
          semantic: 'web-push-provider-endpoint',
          maxSize: 2048,
          accepts: (_value, context) => {
            try {
              validatePushSubscription(context.body?.subscription);
              return true;
            } catch {
              return false;
            }
          },
          skipSignatureRules: '*',
          fallbackContext: 'identifier',
        }),
      ],
      [
        'body.subscription.keys.p256dh',
        policy({
          semantic: 'web-push-p256dh',
          maxSize: 87,
          accepts: (value) =>
            typeof value === 'string' &&
            /^[A-Za-z0-9_-]{87}$/.test(value) &&
            Buffer.from(value, 'base64url').length === 65 &&
            Buffer.from(value, 'base64url')[0] === 4,
          skipSignatureRules: '*',
          fallbackContext: 'identifier',
        }),
      ],
      [
        'body.subscription.keys.auth',
        policy({
          semantic: 'web-push-auth',
          maxSize: 22,
          accepts: (value) =>
            typeof value === 'string' &&
            /^[A-Za-z0-9_-]{22}$/.test(value) &&
            Buffer.from(value, 'base64url').length === 16,
          skipSignatureRules: '*',
          fallbackContext: 'identifier',
        }),
      ],
    ]),
  ],
  [
    'POST /daily-review/items/:id/action',
    new Map([
      [
        'body.action',
        policy({
          semantic: 'daily-review-item-action',
          maxSize: 32,
          accepts: (value) => DAILY_REVIEW_ITEM_ACTIONS.has(String(value || '')),
          skipSignatureRules: '*',
          fallbackContext: 'identifier',
        }),
      ],
    ]),
  ],
  [
    'POST /daily-review/today/action',
    new Map([
      [
        'body.action',
        policy({
          semantic: 'daily-review-session-action',
          maxSize: 32,
          accepts: (value) => DAILY_REVIEW_SESSION_ACTIONS.has(String(value || '')),
          skipSignatureRules: '*',
          fallbackContext: 'identifier',
        }),
      ],
    ]),
  ],
  [
    'POST /note/uploadDrawingThumbnail',
    new Map([
      [
        'body.thumbnail',
        policy({
          semantic: 'webp-data-url',
          maxSize: DRAWING_THUMBNAIL_MAX_BYTES,
          sizeUnit: 'decoded-bytes',
          accepts: (value) => isDataUrl(value, WEBP_DATA_URL_PREFIX),
          measure: (value) => base64DecodedLength(String(value || '').slice(WEBP_DATA_URL_PREFIX.length)),
        }),
      ],
    ]),
  ],
  [
    'POST /note/updateDrawingNote',
    new Map([
      [
        'body.scene',
        policy({
          semantic: 'drawing-scene',
          maxSize: DRAWING_SCENE_MAX_BYTES,
          sizeUnit: 'utf8-bytes',
          skipSignatureRules: '*',
        }),
      ],
    ]),
  ],
  [
    'POST /note/convertMode',
    new Map([
      [
        'body.convertedContent',
        policy({ semantic: 'note-content', maxSize: NOTE_CONTENT_MAX_LENGTH, skipSignatureRules: '*' }),
      ],
    ]),
  ],
  [
    'POST /note/exportFile',
    new Map([
      [
        'body.contentBase64',
        policy({
          semantic: 'export-base64',
          maxSize: NOTE_EXPORT_MAX_BYTES,
          sizeUnit: 'decoded-bytes',
          accepts: isBase64Payload,
          measure: base64DecodedLength,
        }),
      ],
    ]),
  ],
  [
    'POST /bookmark/resolveUrl',
    new Map([
      [
        'body.url',
        policy({
          semantic: 'bookmark-url-input',
          maxSize: MAX_BOOKMARK_INPUT_LENGTH,
          // 分享文案允许换行，但 URL 中的私网地址仍需保留 SSRF 证据。
          skipSignatureRules: Object.freeze(['CRLF_INJECTION']),
        }),
      ],
    ]),
  ],
  ...['/ai/skills/execute', '/ai/skills/stream'].map((path) => [
    `POST ${path}`,
    new Map([
      [
        'body.input.text',
        policy({
          semantic: 'ai-note-transform-text',
          maxSize: AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS,
          accepts: (_value, context) => String(context?.body?.skillId || '') === 'note.transform_text',
          // 笔记原文只会作为模型输入和预览结果处理，不会进入命令、路径或模板执行器。
          skipSignatureRules: '*',
        }),
      ],
    ]),
  ]),
  ...['/bookmark/addTag', '/bookmark/updateTag'].map((path) => [
    `POST ${path}`,
    new Map([
      [
        'body.iconUrl',
        policy({
          semantic: 'tag-svg-data-url',
          maxSize: TAG_ICON_MAX_SVG_BYTES,
          sizeUnit: 'decoded-bytes',
          accepts: (value) => value === '' || isDataUrl(value, SVG_DATA_URL_PREFIX),
          measure: (value) =>
            value === '' ? 0 : base64DecodedLength(String(value || '').slice(SVG_DATA_URL_PREFIX.length)),
        }),
      ],
    ]),
  ]),
]);

export const normalizeSecurityRoutePath = (value = '') => {
  const path = String(value || '').split(/[?#]/, 1)[0] || '/';
  const withoutApiPrefix = path.replace(/^\/api(?=\/|$)/u, '');
  if (withoutApiPrefix.length > 1 && withoutApiPrefix.endsWith('/')) return withoutApiPrefix.slice(0, -1);
  return withoutApiPrefix || '/';
};

const requestFieldValue = (context, field) => {
  const [scope, ...segments] = String(field || '').split('.');
  if (!['body', 'query', 'params'].includes(scope) || segments.length === 0) return undefined;
  let value = context?.[scope];
  for (const segment of segments) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[segment];
  }
  return value;
};

// Plain text rendered as text nodes. Exact routes and field budgets remain independently enforced.
for (const [route, fields] of [
  ['POST /community/posts', { title: 80, body: 4000 }],
  ['POST /community/comments', { body: 1200 }],
  ['POST /community/reports', { detail: 500 }],
  ['POST /community/appeals', { body: 500 }],
  ['POST /community/moderation/posts', { reason: 500 }],
  ['POST /community/moderation/reports', { reason: 500 }],
  ['POST /community/moderation/comments', { reason: 500 }],
  ['POST /community/moderation/appeals', { reason: 500 }],
])
  REQUEST_FIELD_POLICIES.set(
    route,
    new Map(
      Object.entries(fields).map(([field, maxSize]) => [
        `body.${field}`,
        policy({
          semantic: 'community-plain-text',
          maxSize,
          measure: (value) => Array.from(String(value)).length,
          skipSignatureRules: '*',
        }),
      ]),
    ),
  );

for (const [route, maxSize] of [
  ['GET /community/posts', 100],
  ['GET /community/members', 40],
])
  REQUEST_FIELD_POLICIES.set(
    route,
    new Map([
      [
        'query.q',
        policy({
          semantic: 'community-search-text',
          maxSize,
          measure: (value) => Array.from(String(value)).length,
          skipSignatureRules: '*',
        }),
      ],
    ]),
  );

export const resolveRequestFieldPolicy = (context = {}, field = '') => {
  const method = String(context.method || 'GET').toUpperCase();
  const normalizedPath = normalizeSecurityRoutePath(context.path);
  const policyPath = /^\/daily-review\/items\/[^/]+\/action$/u.test(normalizedPath)
    ? '/daily-review/items/:id/action'
    : normalizedPath;
  const routeKey = `${method} ${policyPath}`;
  const definition = method === 'POST' && policyPath === '/ai/skills/execute' &&
    field === 'body.input.text' && context.body?.skillId === 'toolbox.summarize_text'
    ? policy({ semantic: 'ai-document-summary-text', maxSize: AI_DOCUMENT_SUMMARY_MAX_CHARS, skipSignatureRules: '*' })
    : REQUEST_FIELD_POLICIES.get(routeKey)?.get(String(field));
  if (!definition) return null;
  const value = requestFieldValue(context, field);
  const size = definition.sizeUnit === 'utf8-bytes' ? utf8Length(value) : definition.measure(value);
  const measurable = definition.sizeUnit === 'items' ? Array.isArray(value) : typeof value === 'string';
  const withinBudget = measurable && size <= definition.maxSize;
  return {
    semantic: definition.semantic,
    maxSize: definition.maxSize,
    sizeUnit: definition.sizeUnit,
    size,
    withinBudget,
    overBudget: measurable && size > definition.maxSize,
    trustedEnvelope: withinBudget && definition.accepts(value, context),
    skipSignatureRules: definition.skipSignatureRules,
    fallbackContext: definition.fallbackContext,
  };
};
