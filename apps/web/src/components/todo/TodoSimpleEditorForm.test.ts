import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import TodoSimpleEditorForm from './TodoSimpleEditorForm.vue';
import type { TodoEditorSubmission } from '@/api/todoApi';
import zhCN from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('@/api/todoApi', async (original) => ({
  ...(await original<typeof import('@/api/todoApi')>()),
  previewTodoPlanV2: mocks.preview,
  previewTodoPlanUpdateV2: mocks.preview,
  getTodoLists: vi.fn().mockResolvedValue({ status: 200, data: { items: [] } }),
}));
vi.mock('@/api/tagSpace', async (original) => ({
  ...(await original<typeof import('@/api/tagSpace')>()),
  fetchSelectableTags: vi.fn().mockResolvedValue([]),
}));
let cleanup: (() => void) | undefined;
const response = (hash: string, requiredChoices: string[] = []) => ({
  status: 200,
  data: {
    previewHash: hash,
    requiredChoices,
    occurrenceCount: 1,
    generatedNowCount: 1,
    reminderJobCount: 0,
    displaySummary: { title: '单条待办', range: '无日期', timing: '', reminder: '不提醒' },
  },
});
function mount() {
  const submissions: TodoEditorSubmission[] = [];
  const form = ref<{ submit: () => void; isDirty: () => boolean; revealChecklist: () => Promise<void> }>();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(TodoSimpleEditorForm, { ref: form, onSubmit: (value: TodoEditorSubmission) => submissions.push(value) }),
  });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN }, missingWarn: false }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return {
    form,
    host,
    submissions,
    setTitle: async (value: string) => {
      const input = host.querySelector<HTMLInputElement>('input')!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await nextTick();
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  mocks.preview.mockReset();
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});
describe('simple todo editor submission', () => {
  it('子事项编辑入口展开区域并定位，不修改草稿', async () => {
    const { form, host } = mount();
    const heading = host.querySelector<HTMLElement>('.todo-simple-editor__optional-head')!;
    heading.scrollIntoView = vi.fn();
    expect(host.querySelector('.todo-simple-editor__checklist')).toBeNull();
    await form.value!.revealChecklist();
    expect(host.querySelector('.todo-simple-editor__checklist')).not.toBeNull();
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(form.value!.isDirty()).toBe(false);
  });

  it('草稿变更立即使旧预览失效，慢响应不能覆盖新标题；同稿重试复用幂等键', async () => {
    let first!: (v: unknown) => void, second!: (v: unknown) => void;
    mocks.preview
      .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (second = resolve)));
    const { form, setTitle, submissions } = mount();
    expect(form.value!.isDirty()).toBe(false);
    await setTitle('旧标题');
    await vi.advanceTimersByTimeAsync(300);
    await setTitle('最新标题');
    form.value!.submit();
    expect(submissions).toHaveLength(0);
    first(response('old'));
    await vi.advanceTimersByTimeAsync(300);
    form.value!.submit();
    expect(submissions).toHaveLength(0);
    second(response('new'));
    await vi.advanceTimersByTimeAsync(0);
    await nextTick();
    form.value!.submit();
    form.value!.submit();
    expect(submissions).toHaveLength(2);
    expect(submissions[0]).toMatchObject({ kind: 'v2', payload: { title: '最新标题', previewHash: 'new' } });
    if (submissions[0].kind === 'v2' && submissions[1].kind === 'v2')
      expect(submissions[0].payload.idempotencyKey).toBe(submissions[1].payload.idempotencyKey);
    expect(form.value!.isDirty()).toBe(true);
  });
  it('内容修改原位更新，保留既有计划展示但旧校验不可提交', async () => {
    mocks.preview.mockResolvedValueOnce(response('ready')).mockImplementation(() => new Promise(() => {}));
    const { host, form, setTitle, submissions } = mount();
    await setTitle('原标题');
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    const schedule = host.querySelector('.todo-plan-preview__schedule');
    expect(schedule).not.toBeNull();
    await setTitle('更新标题');
    expect(host.querySelector('.todo-plan-preview__schedule')).toBe(schedule);
    expect(host.querySelector('.todo-plan-preview__task')?.textContent).toContain('更新标题');
    form.value!.submit();
    expect(submissions).toHaveLength(0);
  });
  it('需要过去日期选择的服务端预览不能提交', async () => {
    mocks.preview.mockResolvedValue(response('needs-choice', ['pastPolicy']));
    const { form, setTitle, submissions } = mount();
    await setTitle('需要确认');
    await vi.advanceTimersByTimeAsync(300);
    form.value!.submit();
    expect(submissions).toHaveLength(0);
  });
});
