import { describe, expect, it } from 'vitest';
import { decideDirectAgentRoute } from './directRoute.js';

describe('Agent 高置信 direct route', () => {
  it.each(['你好', '谢谢', '你是谁？'])('%s 跳过 Planner', (message) => {
    expect(decideDirectAgentRoute({ message }).direct).toBe(true);
  });

  it.each([
    '什么是零知识证明？',
    '请解释一下量子纠缠',
    '帮我写一首关于夏天的短诗',
    '查一下我的笔记',
    '我今天还有多少 AI 额度？',
    '总结最近收藏的书签',
    '帮我保存 https://example.com',
    '为什么我的云空间没有这个文件？',
    '把待办「测试代办」标记为完成',
  ])('%s 保留工具规划', (message) => {
    expect(decideDirectAgentRoute({ message }).direct).toBe(false);
  });

  it('显式资源或附件始终保留工具规划，翻译模式直接进入 Final', () => {
    expect(decideDirectAgentRoute({ message: '解释一下', contextCount: 1 }).direct).toBe(false);
    expect(decideDirectAgentRoute({ message: '解释一下', attachmentCount: 1 }).direct).toBe(false);
    expect(decideDirectAgentRoute({ message: 'hello', translation: true }).direct).toBe(true);
  });
});
