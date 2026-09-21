import { describe, expect, it } from 'vitest';
import { resolveBriefSourceTarget, resolveBriefOrganizeActions } from './dailyBriefNavigation';
import type { DailyBrief, DailyBriefInsight } from '@/api/dailyBriefApi';

describe('简报整理入口', () => {
  const insight: DailyBriefInsight = {
    id: 'organize',
    text: '模型文字不决定跳转',
    factIds: ['organize_untagged', 'organize_ai_pending', 'organize_untagged'],
  };
  const brief = (untagged: number, pending: number): DailyBrief => ({
    version: 2,
    date: '2026-09-07',
    generatedBy: 'ai',
    headline: '',
    insights: [insight],
    recommendation: '',
    sections: [
      {
        id: 'organize',
        title: '',
        items: [
          { id: 'organize_untagged', label: '', count: untagged, route: 'https://untrusted.example' },
          { id: 'organize_ai_pending', label: '', count: pending },
        ],
      },
    ],
  });
  it('按事实精确导航、AI优先、去重，忽略模型或数据中的地址', () => {
    expect(resolveBriefOrganizeActions(insight, brief(58, 12)).map((a) => a.route)).toEqual([
      '/organize?issue=ai_suggestions',
      '/organize?issue=untagged',
    ]);
  });
  it('仅采纳站内审核任务定位，拒绝外链和无效资源类型', () => {
    const data = brief(0, 3);
    const item = data.sections[0].items[1];
    item.route = '/organize?issue=ai_suggestions&review=pending&runId=old-run&resourceType=note';
    expect(resolveBriefOrganizeActions(insight, data)[0].route).toBe(item.route);
    for (const route of [
      'https://evil.example/organize?review=pending&runId=old-run&resourceType=note',
      '/organize?review=pending&runId=old-run&resourceType=user',
    ]) {
      item.route = route;
      expect(resolveBriefOrganizeActions(insight, data)[0].route).toBe('/organize?issue=ai_suggestions');
    }
  });
  it('只展示有数量且被当前洞察引用的入口', () => {
    expect(resolveBriefOrganizeActions(insight, brief(58, 0)).map((a) => a.id)).toEqual(['organize_untagged']);
    expect(resolveBriefOrganizeActions({ ...insight, factIds: ['note_created_today'] }, brief(58, 12))).toEqual([]);
    expect(resolveBriefOrganizeActions(insight, brief(0, NaN))).toEqual([]);
    expect(resolveBriefOrganizeActions(insight, null)).toEqual([]);
  });
});
describe('简报来源导航', () => {
  it('笔记保留工作台返回来源，文件定位到云空间', () => {
    expect(resolveBriefSourceTarget({ type: 'note', id: 'n', title: '笔记' })?.route).toEqual({
      path: '/noteLibrary/n',
      query: { from: '/workbenches' },
    });
    expect(resolveBriefSourceTarget({ type: 'file', id: 'f', title: '文件' })?.route).toEqual({
      path: '/cloudSpace',
      query: { fileId: 'f', fileName: '文件' },
    });
  });
  it('书签沿用安全网址解析，不允许脚本或凭据链接', () => {
    expect(
      resolveBriefSourceTarget({ type: 'bookmark', id: 'b', title: '网页', url: 'https://example.com' })?.external,
    ).toBeTruthy();
    for (const url of ['javascript:alert(1)', 'https://user:secret@example.com', '']) {
      expect(resolveBriefSourceTarget({ type: 'bookmark', id: 'b', title: '网页', url })).toBeNull();
    }
  });
});
