import { describe, expect, it } from 'vitest';
import {
  AI_CHAT_TOUCH_INTENT_THRESHOLD,
  getAiChatBottomDistance,
  isAiChatUpwardScroll,
  isAiChatUpwardTouch,
  isAiChatUpwardWheel,
  resolveAiChatPostAnswerViewport,
  resolveAiChatStableViewport,
  shouldPauseAiChatFollow,
  shouldResumeAiChatFollow,
  shouldShowAiChatScrollPrompt,
} from './aiAutoScroll';

describe('aiAutoScroll', () => {
  it('使用同一套布局坐标计算距底部距离', () => {
    expect(getAiChatBottomDistance({ scrollHeight: 1000, scrollTop: 650, clientHeight: 300 })).toBe(50);
    expect(getAiChatBottomDistance({ scrollHeight: 500, scrollTop: 250, clientHeight: 300 })).toBe(0);
  });

  it('离开底部后暂停，真正回到底部才恢复', () => {
    expect(shouldPauseAiChatFollow(121)).toBe(true);
    expect(shouldPauseAiChatFollow(120)).toBe(false);
    expect(shouldResumeAiChatFollow(8)).toBe(true);
    expect(shouldResumeAiChatFollow(9)).toBe(false);
  });

  it('移动端轻微上滑可以暂停跟随，但不会过早显示回到底部按钮', () => {
    expect(shouldShowAiChatScrollPrompt(24, false)).toBe(false);
    expect(shouldShowAiChatScrollPrompt(120, false)).toBe(false);
    expect(shouldShowAiChatScrollPrompt(121, false)).toBe(true);
    expect(shouldShowAiChatScrollPrompt(121, true)).toBe(false);
  });

  it('只把明确向上浏览的滚轮和越过阈值的触摸动作当作用户中断', () => {
    expect(isAiChatUpwardWheel(-1)).toBe(true);
    expect(isAiChatUpwardWheel(1)).toBe(false);
    expect(isAiChatUpwardScroll(320, 280)).toBe(true);
    expect(isAiChatUpwardScroll(280, 320)).toBe(false);
    expect(AI_CHAT_TOUCH_INTENT_THRESHOLD).toBe(24);
    expect(isAiChatUpwardTouch(120, 143)).toBe(false);
    expect(isAiChatUpwardTouch(120, 144)).toBe(true);
    expect(isAiChatUpwardTouch(140, 120)).toBe(false);
    expect(isAiChatUpwardTouch(null, 120)).toBe(false);
  });

  it('回答后附属内容出现时保留原位置，并在内容位于下方时提示用户', () => {
    expect(resolveAiChatStableViewport({ scrollHeight: 1100, clientHeight: 300 }, 700)).toEqual({
      scrollTop: 700,
      shouldFollow: false,
      showScrollToBottom: true,
    });
    expect(resolveAiChatStableViewport({ scrollHeight: 1000, clientHeight: 300 }, 695)).toEqual({
      scrollTop: 695,
      shouldFollow: true,
      showScrollToBottom: false,
    });
  });

  it('回答结束时只对已离开底部的用户冻结位置', () => {
    expect(resolveAiChatPostAnswerViewport({ scrollHeight: 1100, clientHeight: 300 }, 700, true)).toEqual({
      scrollTop: 800,
      shouldFollow: true,
      showScrollToBottom: false,
    });
    expect(resolveAiChatPostAnswerViewport({ scrollHeight: 1100, clientHeight: 300 }, 700, false)).toEqual({
      scrollTop: 700,
      shouldFollow: false,
      showScrollToBottom: true,
    });
  });
});
