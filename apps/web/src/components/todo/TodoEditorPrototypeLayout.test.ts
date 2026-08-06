import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (file: string) => readFileSync(resolve(process.cwd(), `src/components/todo/${file}`), 'utf8');
const modalSource = readSource('TodoEditorModal.vue');
const formSource = readSource('TodoEditorForm.vue');
const scheduleSource = readSource('TodoPlanScheduleEditor.vue');

describe('待办创建页原型布局', () => {
  it('PC 使用宽幅编辑区，并将服务端计划预览固定为独立右栏', () => {
    expect(modalSource).toContain('width="min(1180px, 90vw)"');
    expect(formSource).toMatch(/\.todo-editor-form\.is-desktop-plan[\s\S]*?padding:\s*22px 410px 24px 22px/);
    expect(scheduleSource).toContain("'is-desktop-layout': desktopLayout");
    expect(scheduleSource).toMatch(
      /\.todo-plan-editor\.is-desktop-layout > \.todo-plan-preview[\s\S]*?position:\s*absolute[\s\S]*?width:\s*388px/,
    );
    expect(scheduleSource).toContain('<slot name="preview-actions" />');
  });

  it('计划方式、提醒方式和优先级均使用原型中的分段按钮而不是下拉框', () => {
    expect(formSource).toMatch(/class="todo-editor-form__segment"[\s\S]*?v-for="option in priorityOptions"/);
    expect(scheduleSource).toMatch(/todo-plan-editor__segment--plan[\s\S]*?v-for="option in planTypeOptions"/);
    expect(scheduleSource).toMatch(/todo-plan-editor__segment--reminder[\s\S]*?v-for="option in reminderModeOptions"/);
  });

  it('移动端使用全屏三步流程、顶部进度和固定底部动作', () => {
    expect(modalSource).toContain(':mobile-full-screen="bookmark.isMobile"');
    expect(modalSource).toContain(':mobile-centered-header="bookmark.isMobile"');
    expect(modalSource).toContain('{{ mobileStep }} / 3');
    expect(formSource).toContain('class="todo-editor-form__progress-track"');
    expect(formSource).toContain('mobileStep === 1');
    expect(formSource).toContain('mobileStep < 3');
    expect(formSource).toMatch(/\.todo-editor-form__actions\.is-sticky[\s\S]*?position:\s*sticky/);
    expect(scheduleSource).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.todo-plan-editor\.is-mobile-step/);
  });

  it('过去日期必须用三个解释清楚的显式选项确认', () => {
    expect(scheduleSource).toContain('class="todo-plan-editor__past-options"');
    expect(scheduleSource).toContain("'keep_overdue' as const");
    expect(scheduleSource).toContain("'restart_today_keep_count' as const");
    expect(scheduleSource).toContain("'skip_missed' as const");
    expect(scheduleSource).toContain("t('inbox.todoPastKeepHint')");
  });
});
