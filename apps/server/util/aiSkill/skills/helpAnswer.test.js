import { describe, expect, it, vi } from 'vitest';
import helpAnswer from './helpAnswer.js';

describe('help.answer', () => {
  it('强制只检索公开帮助资料', async () => {
    const retrieveHelp = vi.fn().mockResolvedValue([{ id: 'h-1', title: '帮助', content: '公开说明' }]);
    const prepared = await helpAnswer.prepare({
      input: { question: '怎么导出？' },
      dependencies: { retrieveHelp },
    });
    expect(retrieveHelp).toHaveBeenCalledWith(null, '怎么导出？', 5, true);
    expect(prepared.sources[0].resourceType).toBe('help');
    expect(prepared.sources[0].target.path).toBe('/help?article=h-1');
    expect(prepared.messages[0].content).toContain('不能读取或推测用户的笔记');
  });

  it.each(['你好', '不存在的功能', '帮我写一篇小说'])('无公开命中 %s 交给模型友好引导，不附加假来源与无效动作', async (question) => {
    const prepared = await helpAnswer.prepare({
      input: { question },
      dependencies: { retrieveHelp: vi.fn().mockResolvedValue([]) },
    });
    expect(prepared.modelCalled).not.toBe(false);
    expect(prepared.result).toBeUndefined();
    expect(prepared.sources).toEqual([]);
    expect(prepared.coverage).toEqual({ complete: false, warnings: [] });
    expect(prepared.availableActions).toBeUndefined();
    expect(prepared.messages[1]).toEqual({ role: 'user', content: question });
    expect(prepared.messages[0].content).toContain('不得编造产品功能');
  });

  it('等级权益问题优先使用运行时规则，并剔除仍声称满级 200 万的旧知识', async () => {
    const prepared = await helpAnswer.prepare({
      input: { question: '不同等级的权益是什么？15级 AI 额度有多少？' },
      dependencies: {
        retrieveHelp: vi.fn().mockResolvedValue([
          {
            id: 'stale-growth-help',
            title: '旧等级权益',
            content: 'Lv.15 每日 AI 额度为 200 万 tokens。',
          },
          { id: 'other-help', title: '成长说明', content: '升级需要积累经验。' },
        ]),
      },
    });

    expect(prepared.sources.map((source) => source.resourceId)).toEqual([
      '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7',
      'other-help',
    ]);
    expect(prepared.sources[0].target).toBeUndefined();
    expect(prepared.messages[1].content).toContain('Lv.15 文圣');
    expect(prepared.messages[1].content).toContain('每日 AI 额度 50 万 tokens');
    expect(prepared.messages[1].content).toContain('云空间 20 GB');
    expect(prepared.messages[1].content).not.toContain('200 万 tokens');
    expect(prepared.messages[0].content).toContain('运行时规则生成');
  });

  it('普通帮助问题不注入无关的成长权益资料', async () => {
    const retrieveHelp = vi.fn().mockResolvedValue([{ id: 'export', title: '导出笔记', content: '打开更多菜单。' }]);
    const prepared = await helpAnswer.prepare({
      input: { question: '怎么导出笔记？' },
      dependencies: { retrieveHelp },
    });

    expect(prepared.sources).toHaveLength(1);
    expect(prepared.sources[0].resourceId).toBe('export');
    expect(prepared.messages[1].content).not.toContain('当前成长等级权益');
  });
});
