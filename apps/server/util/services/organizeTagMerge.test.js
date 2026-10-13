import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../aiSkill/structuredModel.js', () => ({
  callStructuredSkillModel: vi.fn(),
  estimateStructuredSkillModelTokens: () => 100,
}));
import { callStructuredSkillModel } from '../aiSkill/structuredModel.js';
import {
  readTagMergeCandidates,
  tagMergeRequests,
  estimateTagMergeTokens,
  suggestTagMerge,
} from './organizeTagMerge.js';
beforeEach(() => vi.clearAllMocks());
it('比较冻结范围，统一合并方向且不会将其他账号标签作为目标', async () => {
  const db = {
    query: vi.fn(async () => [
      [
        { id: 'a', name: 'JavaScript' },
        { id: 'b', name: 'JS' },
        { id: 'c', name: '前端' },
      ],
    ]),
  };
  expect(await readTagMergeCandidates(db, 'u', 'run', 'b')).toEqual([{ id: 'a', name: 'JavaScript', description: '' }]);
  expect(db.query.mock.calls[0][1]).toEqual(['u', 'run', 'u']);
});
it('同义判断高置信且只能从候选中选择；相关主题、低置信和虚构目标不能进入合并', async () => {
  const source = { title: 'JS', mergeCandidates: [{ id: 'a', name: 'JavaScript', description: '' }] };
  const request = tagMergeRequests(source)[0];
  expect(request.validateArguments({ targetId: 'a', confidence: 0.97, reason: '通用缩写' })).toMatchObject({
    targetId: 'a',
  });
  for (const value of [
    { targetId: 'outside', confidence: 1, reason: '无依据' },
    { targetId: 'a', confidence: 0.8, reason: '主题相关' },
    { targetId: '', confidence: 1, reason: '不是同义' },
  ])
    expect(request.validateArguments(value)).toBeNull();
  expect(() => request.validateArguments({})).toThrow('格式无效');
});
it('全部候选按有界批次检查，找到明确同义词后停止，不重复调用', async () => {
  const source = {
    title: 'JS',
    mergeCandidates: Array.from({ length: 161 }, (_, i) => ({ id: String(i), name: String(i) })),
  };
  const before = vi.fn();
  callStructuredSkillModel
    .mockImplementationOnce(async ({ beforeRequest }) => {
      await beforeRequest();
      return null;
    })
    .mockImplementationOnce(async ({ validateArguments, beforeRequest }) => {
      await beforeRequest();
      return validateArguments({ targetId: '90', confidence: 1, reason: '同义' });
    });
  expect(estimateTagMergeTokens(source)).toBe(300);
  expect(await suggestTagMerge(source, before)).toMatchObject({ targetId: '90' });
  expect(callStructuredSkillModel).toHaveBeenCalledTimes(2);
  expect(before).toHaveBeenCalledTimes(2);
  expect(await suggestTagMerge({ title: 'only', mergeCandidates: [] })).toBeNull();
});
