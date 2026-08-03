import { describe, expect, it, vi } from 'vitest';
import {
  AI_ASSISTANT_OPEN_EVENT,
  AI_ASSISTANT_VISIBILITY_EVENT,
  getAiAssistantVisibility,
  normalizeAiAssistantLaunchPayload,
  openAiAssistant,
  setAiAssistantVisibility,
  shouldHideAiEdgeTrigger,
} from './aiEntry';

describe('aiEntry', () => {
  it('只保留受支持、数量受限的启动上下文', () => {
    const payload = normalizeAiAssistantLaunchPayload({
      suggestedIntent: 'compare',
      surface: 'search',
      query: '  agent  ',
      contextRefs: [
        { type: 'note', id: 1, title: 'A' },
        { type: 'unknown', id: 2, title: 'B' },
      ],
    });
    expect(payload).toMatchObject({
      suggestedIntent: 'compare',
      surface: 'search',
      query: 'agent',
      contextRefs: [{ type: 'note', id: '1', title: 'A' }],
    });
  });

  it('AI 专用入口允许待办实体，但仍拒绝未知类型', () => {
    expect(
      normalizeAiAssistantLaunchPayload({
        contextRefs: [
          { type: 'todo', id: 'todo-1', title: '整理发票' },
          { type: 'unknown', id: 'unknown-1', title: '未知对象' },
        ],
      }).contextRefs,
    ).toEqual([{ type: 'todo', id: 'todo-1', title: '整理发票' }]);
  });

  it('丢弃未知入口标识，避免把自由文本带入埋点', () => {
    expect(normalizeAiAssistantLaunchPayload({ surface: 'private note title' }).surface).toBeUndefined();
  });

  it.each(['bookmark_manage', 'cloud_space', 'tag_detail'] as const)('保留无正文的资源入口枚举 %s', (surface) => {
    expect(normalizeAiAssistantLaunchPayload({ surface }).surface).toBe(surface);
  });

  it('发送统一的类型化打开事件', () => {
    const listener = vi.fn();
    window.addEventListener(AI_ASSISTANT_OPEN_EVENT, listener);
    openAiAssistant({ suggestedIntent: 'summarize' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail.suggestedIntent).toBe('summarize');
    window.removeEventListener(AI_ASSISTANT_OPEN_EVENT, listener);
  });

  it('保留书签生成笔记入口的专用预填意图', () => {
    expect(normalizeAiAssistantLaunchPayload({ suggestedIntent: 'create_note' }).suggestedIntent).toBe('create_note');
  });

  it('同步 AI 工作区显隐状态给移动端导航', () => {
    const listener = vi.fn();
    window.addEventListener(AI_ASSISTANT_VISIBILITY_EVENT, listener);
    setAiAssistantVisibility(true);
    expect(getAiAssistantVisibility()).toBe(true);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ open: true });
    setAiAssistantVisibility(false);
    expect(getAiAssistantVisibility()).toBe(false);
    window.removeEventListener(AI_ASSISTANT_VISIBILITY_EVENT, listener);
  });

  it('移动端只在笔记详情展示 AI 侧边图标，桌面端保持全局入口', () => {
    expect(shouldHideAiEdgeTrigger(true, 'noteDetail')).toBe(false);
    expect(shouldHideAiEdgeTrigger(true, 'settings')).toBe(true);
    expect(shouldHideAiEdgeTrigger(true, 'growth')).toBe(true);
    expect(shouldHideAiEdgeTrigger(false, 'settings')).toBe(false);
  });
});
