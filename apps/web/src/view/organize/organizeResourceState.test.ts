import { expect, it } from 'vitest';
import type { SuggestionRun, WorkspaceItem, WorkspaceSuggestion } from '@/api/organizeSuggestionApi';
import { resourceGroup, resourceWork, reviewDisposition } from './organizeResourceState';
const run = { status: 'running', runVersion: 3 } as SuggestionRun;
const suggestion = (status: string, kind = 'tags') =>
  ({ id: kind, kind, status, reason: '', before: null, after: null }) as WorkspaceSuggestion;
const item = (patch: Partial<WorkspaceItem> = {}) =>
  ({
    id: 'i',
    aiStatus: 'not_needed',
    ruleStatus: 'completed',
    resource: {
      id: 'n',
      type: 'note',
      title: '轻笺',
      tags: [],
      source: { folder: '' },
      guards: {},
      evidenceLevel: 'text',
    },
    suggestions: [
      suggestion('not_applicable'),
      suggestion('not_applicable', 'title'),
      suggestion('no_suggestion', 'empty'),
    ],
    ...patch,
  }) as WorkspaceItem;
it('已有标签、标题正常、没有空内容问题，在整批运行时也立即归入无需调整', () => {
  expect(resourceGroup(item(), run)).toBe('clear');
  expect(resourceGroup(item({ suggestions: [suggestion('not_applicable')] }), run)).toBe('clear');
});
it('重复检查仍在等待时保留工作事实，不能从已交付检查推断完成', () => {
  const row = item({ work: [{ kind: 'duplicate', lane: 'direct', status: 'waiting' }] });
  expect(resourceGroup(row, run)).toBe('analysis');
  expect(resourceWork(row)).toEqual(row.work);
  expect(resourceGroup(row, { ...run, status: 'ended' })).toBe('unfinished');
});
it.each([
  [['pending'], 'priority', 'closed'],
  [['applied', 'pending'], 'priority', 'applied'],
  [['applied'], 'reviewed', 'applied'],
  [['ignored'], 'reviewed', 'ignored'],
  [['applied', 'ignored'], 'reviewed', 'mixed'],
  [['applied', 'failed'], 'unfinished', 'applied'],
  [['applied', 'queued'], 'analysis', 'applied'],
  [['applied', 'insufficient'], 'manual', 'applied'],
  [['expired'], 'expired', 'closed'],
])('审核组合 %j → %s', (states, group, disposition) => {
  const row = item({ suggestions: states.map((s) => suggestion(s)) });
  expect(resourceGroup(row, run)).toBe(group);
  expect(reviewDisposition(row)).toBe(disposition);
});
it('本轮删除属于已处理，历史未知状态不伪装运行中', () => {
  expect(resourceGroup(item({ ruleStatus: 'removed' }), run)).toBe('reviewed');
  expect(reviewDisposition(item({ ruleStatus: 'removed' }))).toBe('applied');
  expect(resourceGroup(item({ ruleStatus: undefined }), run)).toBe('unfinished');
  expect(resourceGroup(item({ ruleStatus: 'skipped' }), run)).toBe('skipped');
});
it('服务端结论优先，旧 AI 字段不能覆盖它', () => {
  expect(resourceGroup(item({ outcome: 'unchanged', aiStatus: 'queued' }), run)).toBe('clear');
  expect(resourceGroup(item({ outcome: 'unfinished' }), run)).toBe('unfinished');
});

it('尚未生成处理任务的检查阶段仍显示等待，取消不冒充状态未知', () => {
  expect(resourceWork(item({ work: [], ruleStatus: 'pending' }))).toEqual([
    { kind: 'prepare', lane: 'direct', status: 'queued' },
  ]);
  expect(resourceWork(item({ work: [], ruleStatus: 'cancelled' }))).toEqual([
    { kind: 'prepare', lane: 'direct', status: 'cancelled' },
  ]);
  expect(resourceWork(item({ work: [{ kind: 'analysis', lane: 'ai', status: 'failed', resolved: true }] }))).toEqual(
    [],
  );
});
