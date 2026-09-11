import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../aiSkill/structuredModel.js', () => ({ callStructuredSkillModel: vi.fn() }));
import { callStructuredSkillModel } from '../aiSkill/structuredModel.js';
import { suggestResourceMetadata } from './organizeSuggestionModel.js';
const snapshot = { title: '未命名文档', source: { title: '未命名文档', text: 'Vue 组件通过 props 传递数据。' } };
beforeEach(() => vi.clearAllMocks());
it('一次结构化调用生成两个字段，只接受高置信原文证据', async () => {
  callStructuredSkillModel.mockImplementation(async (opts) =>
    opts.validateArguments({
      title: { name: 'Vue 组件通信', confidence: 0.95, evidence: 'Vue 组件' },
      tags: [
        { name: 'Vue', confidence: 0.95, evidence: 'Vue 组件' },
        { name: '编造主题', confidence: 0.99, evidence: '不存在的内容' },
        { name: '低置信', confidence: 0.5, evidence: 'props' },
      ],
    }),
  );
  const result = await suggestResourceMetadata(snapshot, ['tags', 'title'], [{ id: 't', name: 'Vue' }]);
  expect(callStructuredSkillModel).toHaveBeenCalledTimes(1);
  expect(result.title.name).toBe('Vue 组件通信');
  expect(result.tags).toEqual([expect.objectContaining({ id: 't', name: 'Vue', source: 'existing' })]);
});
it('只选择标签不会输出标题，格式错误交给平台修复', async () => {
  callStructuredSkillModel.mockImplementation(async (opts) =>
    opts.validateArguments({ title: { name: 'Vue', confidence: 1, evidence: 'Vue 组件' }, tags: [] }),
  );
  expect((await suggestResourceMetadata(snapshot, ['tags'], [])).title).toBeNull();
  callStructuredSkillModel.mockImplementation(async (opts) => opts.validateArguments({ tags: [] }));
  await expect(suggestResourceMetadata(snapshot, ['title'], [])).rejects.toMatchObject({
    code: 'AI_SKILL_STRUCTURED_OUTPUT_INVALID',
  });
});

it('标签图标复用图标服务，不走资料元信息模型', async () => {
  const icons = await import('../tagIconService.js');
  const candidate = { iconName: 'lucide:key', iconUrl: 'safe', color: 'currentColor' };
  const recommend = vi.spyOn(icons, 'recommendTagIcons').mockResolvedValue([candidate]);
  const result = await suggestResourceMetadata({ type: 'tag', title: '密钥' }, ['tag_icon'], []);
  expect(result).toEqual({ tag_icon: [candidate] });
  expect(recommend).toHaveBeenCalledWith('密钥');
  recommend.mockRestore();
});
