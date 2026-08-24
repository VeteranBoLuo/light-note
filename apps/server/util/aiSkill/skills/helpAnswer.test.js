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
    expect(prepared.messages[0].content).toContain('不能读取或推测用户的笔记');
  });

  it('无公开命中时返回固定安全结果和帮助动作', async () => {
    const prepared = await helpAnswer.prepare({
      input: { question: '不存在的功能' },
      dependencies: { retrieveHelp: vi.fn().mockResolvedValue([]) },
    });
    expect(prepared.modelCalled).toBe(false);
    expect(prepared.result.content).toBe('帮助中心暂未找到可靠说明。');
    expect(prepared.availableActions.map((item) => item.id)).toEqual(['browse_help', 'submit_feedback']);
  });
});
