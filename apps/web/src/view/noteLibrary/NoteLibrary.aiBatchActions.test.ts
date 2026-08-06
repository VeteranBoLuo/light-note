import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteLibrary.vue'), 'utf8');

describe('笔记库批量 AI 操作语义', () => {
  it('桌面与移动端都区分“添加到 AI 助手”和“AI 智能整理”', () => {
    expect(source).toContain("$t('ai.entry.addSelectedToAssistant')");
    expect(source).toContain("$t('bookmarkMg.aiOrganizeBtn')");
    expect(source).toContain("key: 'assistant'");
    expect(source).toContain("key: 'smartOrganize'");
    expect(source).toContain('icon: icon.ai.materials');
    expect(source).toContain('icon: icon.ai.organize');
  });

  it('AI 智能整理把当前所选笔记 ID 交给自动打标签弹窗', () => {
    expect(source).toContain(':selected-ids="selectedAiOrganizeIds"');
    expect(source).toMatch(/function openSelectedAiOrganize\(\)[\s\S]*selectedAiOrganizeIds\.value = selectedIds/);
    expect(source).toMatch(/action\.key === 'smartOrganize'[\s\S]*openSelectedAiOrganize\(\)/);
  });
});
