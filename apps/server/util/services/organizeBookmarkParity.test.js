import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), request: vi.fn(), estimate: vi.fn(() => 1234) }));
vi.mock('../fetchWebMeta.js', () => ({
  fetchWebMeta: mocks.fetch,
  EXPLICIT_WEB_READ_MAX_BYTES: 4000000,
  classifyWebPageSnapshot: () => '',
}));
vi.mock('../agent/aiGateway.js', () => ({ requestAi: mocks.request, estimateAiProviderTokens: mocks.estimate }));
import { suggestBookmarkMeta } from '../aiOrganize.js';
import {
  prepareResourceMetadata,
  suggestResourceMetadata,
  estimateResourceMetadataTokens,
} from './organizeSuggestionModel.js';
import { buildSnapshot } from './organizeSuggestionRules.js';
const row = { id: 'b', name: '字体页面', url: 'https://example.com/fonts', description: '' };
const tags = [{ id: 't', name: '开源项目' }];
const candidate = {
  name: '开源项目',
  source: 'existing',
  relevance: 'strong',
  confidence: 0.96,
  evidence: '开源字体项目',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue({
    ok: true,
    title: '字体页面',
    description: '开源字体项目',
    bodyText: '免费字体',
    source: 'static_html',
  });
  mocks.request.mockResolvedValue({
    content: JSON.stringify({ name: '字体页面', description: '开源字体项目', tagSuggestions: [candidate] }),
  });
});
it('旧入口与整理中心共享材料、提示词、参数及原文候选校验；预备和估算不调用模型', async () => {
  const old = await suggestBookmarkMeta({ ...row, userTags: tags, includeSuggestionDetails: true });
  const oldRequest = mocks.request.mock.calls[0];
  mocks.request.mockClear();
  const snapshot = buildSnapshot('bookmark', row);
  const prepared = await prepareResourceMetadata(snapshot);
  expect(estimateResourceMetadataTokens(snapshot, ['tags'], tags, prepared)).toBe(1234);
  expect(mocks.request).not.toHaveBeenCalled();
  const result = await suggestResourceMetadata(snapshot, ['tags'], tags, prepared);
  expect(result.tags).toEqual(old.suggestions);
  expect(mocks.request.mock.calls[0]).toEqual(oldRequest);
  expect(mocks.estimate).toHaveBeenCalledWith(oldRequest[0], oldRequest[1]);
  expect(result.title).toBeNull();
});
it('有名称和原描述不抓取网页，拼接存档不能伪装原描述完整', async () => {
  await prepareResourceMetadata(buildSnapshot('bookmark', { ...row, description: '已有描述' }));
  expect(mocks.fetch).not.toHaveBeenCalled();
  await prepareResourceMetadata(
    buildSnapshot('bookmark', { ...row, description: '存档正文', original_description: '' }),
  );
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
it('已关联推荐标签被剔除，并明确报告无需追加', async () => {
  const snapshot = buildSnapshot('bookmark', row, tags);
  const result = await suggestResourceMetadata(snapshot, ['tags'], tags, await prepareResourceMetadata(snapshot));
  expect(result).toMatchObject({ tags: [], tagOutcome: 'already_associated' });
});
it.each([
  ['no_suggestion', []],
  ['filtered', [{ ...candidate, evidence: '不存在的证据' }]],
  ['filtered', [{ ...candidate, confidence: 0.5 }]],
])('区分空结果 %s', async (tagOutcome, tagSuggestions) => {
  mocks.request.mockResolvedValue({ content: JSON.stringify({ name: '', description: '', tagSuggestions }) });
  const snapshot = buildSnapshot('bookmark', row);
  expect(
    await suggestResourceMetadata(snapshot, ['tags'], tags, await prepareResourceMetadata(snapshot)),
  ).toMatchObject({ tags: [], tagOutcome });
});
it('网页读取失败有已有标题可回退；完全没有材料则不调用模型', async () => {
  mocks.fetch.mockResolvedValue({ ok: false, reason: 'AUTH_REQUIRED' });
  const partial = await prepareResourceMetadata(buildSnapshot('bookmark', row));
  expect(partial).toMatchObject({ metadataSource: 'provided_partial', fetchReason: 'AUTH_REQUIRED' });
  expect(partial.pageInfo).toContain(row.name);
  await expect(prepareResourceMetadata(buildSnapshot('bookmark', { ...row, name: '' }))).rejects.toMatchObject({
    code: 'BOOKMARK_PAGE_AUTH_REQUIRED',
  });
  expect(mocks.request).not.toHaveBeenCalled();
});
it('协议失败不能当作没有建议', async () => {
  mocks.request.mockResolvedValue({ content: '{}' });
  const snapshot = buildSnapshot('bookmark', row);
  await expect(
    suggestResourceMetadata(snapshot, ['tags'], tags, await prepareResourceMetadata(snapshot)),
  ).rejects.toMatchObject({ code: 'AI_SKILL_STRUCTURED_OUTPUT_INVALID' });
});
