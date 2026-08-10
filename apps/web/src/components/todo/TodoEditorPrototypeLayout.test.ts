import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { suggestTodoPlanEndDate } from './todoDraftNormalizer';

const readSource = (file: string) => readFileSync(resolve(process.cwd(), `src/components/todo/${file}`), 'utf8');
const modalSource = readSource('TodoEditorModal.vue');
const simpleSource = readSource('TodoSimpleEditorForm.vue');
const reminderSource = readSource('TodoReminderEditor.vue');
const repeatReminderSource = readSource('TodoReminderRepeatEditor.vue');
const independentSource = readSource('TodoIndependentTaskPlanEditor.vue');
const draftSource = readSource('useTodoCreateDraft.ts');
const mobileCreateSource = readFileSync(resolve(process.cwd(), 'src/view/todo/TodoCreate.vue'), 'utf8');
const todoCreateRouteSource = readFileSync(resolve(process.cwd(), 'src/router/modules/todoCreate.ts'), 'utf8');
const quickCaptureSource = readFileSync(resolve(process.cwd(), 'src/components/inbox/QuickCaptureModal.vue'), 'utf8');

describe('待办创建页原型布局', () => {
  it('PC 使用宽幅编辑区，并将服务端计划预览固定为独立右栏', () => {
    expect(modalSource).toContain('width="min(1280px, 94vw)"');
    expect(simpleSource).toContain('class="todo-simple-editor__preview"');
    expect(simpleSource).toMatch(/\.todo-simple-editor__body[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 390px/);
    expect(simpleSource).toMatch(/\.todo-simple-editor__preview-sticky[\s\S]*?position:\s*sticky/);
    expect(simpleSource).toContain('todoSinglePreviewAdvancedHint');
    expect(simpleSource).toMatch(/todo-simple-editor__preview-note[\s\S]*?workspace-panel-bg-color/);
  });

  it('PC 长表单仅滚动内容区，紧凑操作栏始终固定在抽屉底部', () => {
    expect(modalSource).toContain("'uses-simple-editor': useSimpleEditor");
    expect(modalSource).toMatch(
      /\.todo-editor-shell\.uses-simple-editor:not\(\.is-mobile\)[\s\S]*?height:\s*100%[\s\S]*?overflow:\s*hidden/,
    );
    expect(simpleSource).toMatch(
      /\.todo-simple-editor\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) auto[\s\S]*?overflow:\s*hidden/,
    );
    expect(simpleSource).toMatch(/\.todo-simple-editor__body[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto/);
    expect(simpleSource).toMatch(/\.todo-simple-editor__footer[\s\S]*?position:\s*relative[\s\S]*?min-height:\s*56px/);
  });

  it('计划方式、提醒方式和优先级均使用原型中的分段按钮而不是下拉框', () => {
    expect(simpleSource).toMatch(/todo-simple-editor__priority[\s\S]*?v-for="option in priorityOptions"/);
    expect(reminderSource).toMatch(/todo-reminder-editor-v3__mode[\s\S]*?v-for="option in modeOptions"/);
    expect(simpleSource).toContain('<BSwitch v-model:checked="draft.independentTasks.enabled" />');
  });

  it('提醒方式与周期类型都是三等分整区可点击，移动端保留足够触控高度', () => {
    expect(reminderSource).toMatch(
      /\.todo-reminder-editor-v3__mode\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(reminderSource).toMatch(
      /\.todo-reminder-editor-v3__mode :deep\(\.b_btn\)\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/,
    );
    expect(repeatReminderSource).toMatch(
      /\.todo-reminder-repeat__segment\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(repeatReminderSource).toMatch(
      /\.todo-reminder-repeat__segment :deep\(\.b_btn\)\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/,
    );
    expect(reminderSource).toMatch(/@media \(max-width: 767px\)[\s\S]*?min-height:\s*44px/);
    expect(repeatReminderSource).toMatch(/@media \(max-width: 767px\)[\s\S]*?min-height:\s*44px/);
  });

  it('移动端新建使用通知页式独立路由，保留一页渐进披露和固定底部动作', () => {
    expect(todoCreateRouteSource).toContain("path: '/todo/new'");
    expect(mobileCreateSource).toContain('class="todo-create-page__header"');
    expect(mobileCreateSource).toContain('<TodoSimpleEditorForm');
    expect(mobileCreateSource).toContain('mobile');
    expect(simpleSource).toContain('todo-simple-editor__mobile-preview');
    expect(simpleSource).toContain('todo-simple-editor__footer');
    expect(simpleSource).toMatch(/\.is-mobile \.todo-simple-editor__footer[\s\S]*?position:\s*fixed/);
    expect(simpleSource).not.toContain('mobileStep ===');
    expect(quickCaptureSource).toContain("router.push({ name: 'todoCreate'");
    expect(quickCaptureSource).toContain('state: { todoInitialValues: todoDraft.value }');
  });

  it('提醒间隔单位不放在同时包裹数字输入的 label 内，避免下拉刚打开就被关闭', () => {
    expect(repeatReminderSource).toContain('class="todo-reminder-repeat__field"');
    expect(repeatReminderSource).toContain(':aria-label="t(\'inbox.todoReminderIntervalUnit\')"');
    expect(repeatReminderSource).not.toContain("<label>\n        <span>{{ t('inbox.todoReminderEvery') }}");
  });

  it('过去日期必须用三个解释清楚的显式选项确认', () => {
    expect(independentSource).toContain("value: 'keep_overdue'");
    expect(independentSource).toContain("value: 'restart_today_keep_count'");
    expect(independentSource).toContain("value: 'skip_missed'");
    expect(independentSource).toContain("t('inbox.todoPastChoiceTitle')");
  });

  it('高级计划默认按日期结束，并完整配置固定时刻和长期运行语义', () => {
    expect(draftSource).toContain("end: { mode: 'until', untilDate: suggestTodoPlanEndDate() }");
    expect(suggestTodoPlanEndDate('2026-08-07 09:00')).toBe('2026-09-06');
    expect(independentSource).toContain('v-model:value="fixedTime" type="time"');
    expect(independentSource).toContain("t('inbox.todoReminderFixedTimeHint')");
    expect(independentSource).toContain("t('inbox.todoPlanNoEndHint')");
    expect(independentSource).toContain("t('inbox.todoPlanEndModeHint')");
    expect(independentSource).toContain("t('inbox.todoPlanEndUsesDueDate')");
    expect(independentSource).toContain(`v-if="endMode === 'until' && !scheduledEndUsesDueDate"`);
  });

  it('高级提醒默认每条一次，多次催办必须明确配置间隔、次数和停止条件', () => {
    expect(simpleSource).toMatch(/draft\.reminder\.mode === 'none'[\s\S]*?mode: 'once_per_instance'/);
    expect(independentSource).toContain('v-model:value="nudgeIntervalValue"');
    expect(independentSource).toContain('v-model:value="nudgeMaxCount"');
    expect(independentSource).toContain('v-model:value="nudgeStop"');
    expect(independentSource).toContain("t('inbox.todoNudgeConfigHint')");
  });

  it('开启高级功能后连续编号为任务内容 1、独立计划 2', () => {
    expect(simpleSource).toContain('{{ draft.independentTasks.enabled ? 2 : 4 }}');
  });

  it('移动端编辑页复用新建页的无边框短输入与日期视觉', () => {
    const editorSource = readSource('TodoEditorForm.vue');
    expect(editorSource).toMatch(
      /todo-editor-form:not\(\.is-desktop-plan\) :deep\(\.b-input\)[\s\S]*?border-color:\s*transparent !important/,
    );
    expect(editorSource).toMatch(
      /todo-editor-form:not\(\.is-desktop-plan\) :deep\(\.b-datetime-trigger\)[\s\S]*?background:\s*var\(--bl-input-noBorder-bg-color\)/,
    );
    expect(editorSource).toMatch(
      /todo-editor-form:not\(\.is-desktop-plan\) :deep\(\.b-textarea\)[\s\S]*?border:\s*1px solid var\(--surface-border-color\)/,
    );
  });

  it('说明输入框使用主题边框，暗色主题不继承基础文本域的浅色硬编码', () => {
    expect(simpleSource).toMatch(
      /todo-simple-editor__content :deep\(\.b-textarea\)[\s\S]*?border:\s*1px solid var\(--surface-border-color\)/,
    );
    expect(simpleSource).toMatch(
      /todo-simple-editor__content :deep\(\.b-textarea:focus\)[\s\S]*?border-color:\s*var\(--focus-ring-color\)/,
    );
  });

  it('普通与高级创建页都使用简洁的开始时间可选标题，不额外堆叠说明', () => {
    expect(simpleSource).toMatch(/todoStartAt[\s\S]*?v-model:value="startAt"/);
    expect(independentSource).toMatch(/todoStartAt[\s\S]*?v-model:value="startAt"/);
    expect(simpleSource).not.toMatch(/v-model:value="startAt"[\s\S]{0,120}todoStartAtOptional/);
    expect(independentSource).not.toMatch(/v-model:value="startAt"[\s\S]{0,120}todoStartAtOptional/);
  });
});
