import { MAX_BOOKMARK_INPUT_LENGTH } from '@lightnote/shared';
import { DRAWING_SCENE_MAX_BYTES } from '@lightnote/shared/drawing-note';
import {
  DRAWING_THUMBNAIL_MAX_BYTES,
  NOTE_CONTENT_MAX_LENGTH,
  NOTE_EXPORT_MAX_BYTES,
  TAG_ICON_MAX_SVG_BYTES,
} from '../contentLimits.js';
import { AI_SKILL_NOTE_TRANSFORM_MAX_TEXT_CHARS } from '../aiSkill/limits.js';

const WEBP_DATA_URL_PREFIX = 'data:image/webp;base64,';
const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;base64,';
const BASE64_PAYLOAD_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/u;
const NO_SIGNATURE_RULE_EXEMPTIONS = Object.freeze([]);

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
}) => Object.freeze({ semantic, maxSize, sizeUnit, accepts, measure, skipSignatureRules });

// 这里只声明“通用安全检测如何理解字段”，不取代业务 handler 的权威内容校验。
// 路由、字段、语义和容量预算必须一起命中；形态不符或超限时仍回到通用签名/异常检测。
const REQUEST_FIELD_POLICIES = new Map([
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

export const resolveRequestFieldPolicy = (context = {}, field = '') => {
  const routeKey = `${String(context.method || 'GET').toUpperCase()} ${normalizeSecurityRoutePath(context.path)}`;
  const definition = REQUEST_FIELD_POLICIES.get(routeKey)?.get(String(field));
  if (!definition) return null;
  const value = requestFieldValue(context, field);
  const size = definition.sizeUnit === 'utf8-bytes' ? utf8Length(value) : definition.measure(value);
  const withinBudget = typeof value === 'string' && size <= definition.maxSize;
  return {
    semantic: definition.semantic,
    maxSize: definition.maxSize,
    sizeUnit: definition.sizeUnit,
    size,
    withinBudget,
    overBudget: typeof value === 'string' && size > definition.maxSize,
    trustedEnvelope: withinBudget && definition.accepts(value, context),
    skipSignatureRules: definition.skipSignatureRules,
  };
};
