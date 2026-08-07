import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/aiAssistant/MainQuestionPrompt.vue'), 'utf8');

describe('移动端 AI 快捷问题交互状态', () => {
  it('只在真正支持悬浮的设备上展示 hover 状态', () => {
    expect(source).toContain('@media (hover: hover) and (pointer: fine)');
    expect(source).toContain('@media (hover: none), (pointer: coarse)');
  });

  it('页面离开和重新激活时清理快捷问题焦点', () => {
    expect(source).toContain('onMounted(() => void nextTick(clearRecommendationFocus))');
    expect(source).toContain('onActivated(() => void nextTick(clearRecommendationFocus))');
    expect(source).toContain('onBeforeUnmount(clearRecommendationFocus)');
    expect(source).toContain('onDeactivated(clearRecommendationFocus)');
  });
});
