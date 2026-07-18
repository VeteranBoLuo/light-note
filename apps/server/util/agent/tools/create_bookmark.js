import { createBookmark } from '../../services/bookmarkService.js';
import { BookmarkUrlError, resolveBookmarkUrlForClient } from '../../bookmarkUrl.js';

function normalizeCreateBookmarkArgs(args = {}) {
  return {
    url: String(args.url || '').trim(),
    name: String(args.name || '').trim(),
    description: String(args.description || '').trim(),
    tags: Array.isArray(args.tags) ? args.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
  };
}

export default {
  name: 'create_bookmark',
  sourceType: 'bookmark',
  description:
    '收藏一个网址为书签。参数 url 必填;name/description 可选(不传则自动抓取网页标题与描述补全);tags 可选(标签名数组,自动创建并关联,最多 4 个)。用于"帮我收藏这个链接"等请求。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要收藏的网址,必填' },
      name: { type: 'string', description: '书签名称,可选;不传则用网页标题' },
      description: { type: 'string', description: '书签描述,可选;不传则用网页描述' },
      tags: { type: 'array', items: { type: 'string' }, description: '要关联的标签名数组,可选,最多 4 个' },
    },
    required: ['url'],
  },
  requireRoot: false,
  isWrite: true,
  directAction: true,
  riskLevel: 'low',
  confirmationPolicy: 'default',
  normalizeArgs: normalizeCreateBookmarkArgs,
  async prepareArgs(args) {
    const normalized = normalizeCreateBookmarkArgs(args);
    if (normalized.tags.length > 4) throw new Error('TOO_MANY_TAGS: 最多选择 4 个标签');
    if (normalized.name.length > 255) throw new Error('TITLE_TOO_LONG: 书签名称不能超过 255 个字符');
    if (normalized.description.length > 255) throw new Error('CONTENT_TOO_LONG: 书签描述不能超过 255 个字符');
    const resolution = await resolveBookmarkUrlForClient(normalized.url, {
      allowTextExtraction: true,
      checkLiveness: true,
    });
    if (resolution.state === 'invalid') {
      throw new BookmarkUrlError(resolution.code, '没有识别到有效的 HTTP 或 HTTPS 地址', {
        urlResolution: resolution,
      });
    }
    if (resolution.state === 'needs_confirmation') {
      throw new BookmarkUrlError(resolution.code, '识别到候选地址，请选择后再收藏', {
        urlResolution: resolution,
      });
    }
    return { ...normalized, url: resolution.canonicalUrl, urlLiveness: resolution.liveness };
  },
  preview(args) {
    const normalized = normalizeCreateBookmarkArgs(args);
    if (!normalized.url) throw new Error('URL_REQUIRED: 网址不能为空');
    const suspect = args.urlLiveness?.status === 'suspect';
    return {
      title: '收藏书签',
      target: normalized.name || normalized.url,
      impact: suspect
        ? '该网址当前可能错误或已经失效；确认后仍会按你选择的地址创建书签'
        : '确认后将创建书签，并按需抓取网页信息、保存正文快照和关联标签',
      details: [
        { key: 'url', value: normalized.url },
        { key: 'name', value: normalized.name || '自动识别' },
        { key: 'description', value: normalized.description || '自动识别' },
        { key: 'tags', value: normalized.tags.join('、') || '无' },
        ...(suspect ? [{ key: 'liveness', value: '疑似失效，请核对地址' }] : []),
      ],
    };
  },
  async execute(args, ctx) {
    const normalized = normalizeCreateBookmarkArgs(args);
    const url = normalized.url;
    if (!url) return { error: 'URL_REQUIRED', message: '网址不能为空' };
    const tagNames = normalized.tags;
    return createBookmark({
      userId: ctx.userId,
      userRole: ctx.userRole,
      bookmark: {
        name: normalized.name,
        url,
        description: normalized.description,
      },
      tagNames,
      tagSource: 'agent',
      fillMetadata: true,
      saveSnapshot: true,
      signal: ctx.signal,
      request: ctx.request,
      suppressUserRewards: ctx.suppressUserRewards,
    });
  },
  transform(raw) {
    if (raw.error) return `收藏失败:${raw.message}`;
    const tagPart = raw.tags?.length ? `,标签:${raw.tags.join('、')}` : '';
    return `✅ 已收藏书签「${raw.name}」${tagPart}(ID: ${raw.id})`;
  },
  summarize(raw) {
    if (raw.error) return `收藏书签失败:${raw.message}`;
    return `收藏书签「${raw.name}」成功`;
  },
};
