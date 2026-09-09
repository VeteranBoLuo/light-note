import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import TodoSimpleEditorForm from './TodoSimpleEditorForm.vue';
import type { TodoEditorSubmission, TodoItem } from '@/api/todoApi';
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
function mount(item?: TodoItem) {
  const submissions: TodoEditorSubmission[] = [];
  const form = ref<{ submit: () => void; isDirty: () => boolean; revealChecklist: () => Promise<void> }>();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(TodoSimpleEditorForm, { item, ref: form, onSubmit: (value: TodoEditorSubmission) => submissions.push(value) }),
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
    const heading = host.querySelector<HTMLElement>('.todo-checklist-editor')!.parentElement!;
    heading.scrollIntoView = vi.fn();
    expect(host.querySelector('.todo-checklist-editor__list')).toBeNull();
    await form.value!.revealChecklist();
    expect(host.querySelector('.todo-checklist-editor__list')).not.toBeNull();
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

it('过去计划默认保留为逾期，提醒默认关闭；刷新及切换处理方式保留选项，无截止时刻也能创建', async () => {
  const pastResponse = (hash: string, code = 'PAST_OCCURRENCE') => ({
    ...response(hash), data: { ...response(hash).data, warnings: [{ code }] },
  });
  mocks.preview.mockResolvedValue(pastResponse('past'));
  const { host, form, setTitle, submissions } = mount();
  await setTitle('无截止时间');
  const toggle = host.querySelector<HTMLElement>('.todo-simple-editor__advanced [role="switch"]')!;
  toggle.click();
  await nextTick();
  await vi.advanceTimersByTimeAsync(300);
  const section = host.querySelector<HTMLElement>('.todo-independent-plan__past')!;
  expect(section).not.toBeNull();
  expect(section.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  expect(mocks.preview.mock.lastCall?.[0]).toMatchObject({
    plan: { pastPolicy: 'keep_overdue' }, reminder: { mode: 'none' }, timing: { dueTime: null },
  });
  let finish!: (value: unknown) => void;
  mocks.preview.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const clickButton = async (text: string) => {
    [...host.querySelectorAll<HTMLButtonElement>('.todo-independent-plan__choices button')]
      .find(button => button.textContent?.trim() === text)!.click();
    await nextTick();
  };
  for (const label of ['每条提醒一次', '任务开始时', '当天固定时刻', '不提醒']) {
    await clickButton(label);
    expect(host.querySelector('.todo-independent-plan__past')).toBe(section);
    await vi.advanceTimersByTimeAsync(300);
    form.value!.submit();
    expect(submissions).toHaveLength(0);
    finish(pastResponse('still-past'));
    await vi.advanceTimersByTimeAsync(0);
    expect(host.querySelector('.todo-independent-plan__past')).toBe(section);
  }
  for (const [index, policy, code] of [
    [1, 'restart_today_keep_count', 'PAST_SCHEDULE_RESTARTED'],
    [2, 'skip_missed', 'PAST_OCCURRENCE'],
    [0, 'keep_overdue', 'PAST_OCCURRENCE'],
  ] as const) {
    section.querySelectorAll<HTMLButtonElement>('button')[index].click();
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.preview.mock.lastCall?.[0].plan.pastPolicy).toBe(policy);
    form.value!.submit();
    expect(submissions).toHaveLength(0);
    finish(pastResponse(policy, code));
    await vi.advanceTimersByTimeAsync(0);
    expect(host.querySelector('.todo-independent-plan__past')).toBe(section);
    expect(section.querySelectorAll('button')[index].getAttribute('aria-pressed')).toBe('true');
  }
  for (const label of ['完成后再次安排', '按日程重复']) {
    await clickButton(label);
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.preview.mock.lastCall?.[0].plan.pastPolicy).toBe('keep_overdue');
    finish(pastResponse('same-policy'));
    await vi.advanceTimersByTimeAsync(0);
  }
  form.value!.submit();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ kind: 'v2', payload: { timing: { dueTime: null }, plan: { pastPolicy: 'keep_overdue' } } });
  await clickButton('每条提醒一次');
  toggle.click();
  await nextTick();
  toggle.click();
  await nextTick();
  await vi.advanceTimersByTimeAsync(300);
  expect(mocks.preview.mock.lastCall?.[0].reminder.mode).toBe('once_per_instance');
  finish(response('future'));
  await vi.advanceTimersByTimeAsync(0);
  expect(host.querySelector('.todo-independent-plan__past')).toBeNull();
});


it('重复待办共用表单，默认仅本次并保留提醒；切换范围后使用原系列规则', async () => {
  mocks.preview.mockResolvedValue(response('edit-series'));
  const item: TodoItem = {
    id: 'instance', title: '编辑系列', status: 'pending', priority: 1, checklist: [{id:'c',text:'已完成子项',done:true}],
    planVersion: 2, seriesId: 'series', occurrenceDate:'2026-09-10', startAt:'2026-09-10 09:00:00', dueAt:'2026-09-10 11:00:00',
    instanceTimezone:'Asia/Shanghai', createdAt:'', updatedAt:'',
    reminder:{mode:'once_per_instance',trigger:{type:'at_start'},channels:['in_app'],quietPolicy:'skip'},
    series:{id:'series',repeatMode:'scheduled',status:'active',timezone:'Asia/Shanghai',version:1,
      plan:{type:'scheduled',frequency:'weekly',weekdays:[2,4],interval:2,end:{mode:'count',count:12}},
      timing:{timezone:'Asia/Shanghai',anchorDate:'2026-09-01',startTime:'09:00',dueTime:'11:00',dueDayOffset:0},
      progress:{completed:0,skipped:0,generated:12,total:12}},
  };
  const { host, form, submissions } = mount(item);
  await vi.advanceTimersByTimeAsync(300);
  expect(mocks.preview.mock.lastCall).toEqual(['instance', 'current', expect.objectContaining({
    plan:expect.objectContaining({type:'once'}), reminder:item.reminder,
    timing:expect.objectContaining({anchorDate:'2026-09-10',startTime:'09:00',dueTime:'11:00'}),
  })]);
  expect(form.value!.isDirty()).toBe(false);
  form.value!.submit();
  expect(submissions[0]).toMatchObject({scope:'current',payload:{checklist:[{id:'c',done:true}]}});
  host.querySelector<HTMLElement>('.todo-simple-editor__scope [role="combobox"]')!.click();
  await nextTick();
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(el=>el.textContent?.trim()==='整个系列')!.click();
  await vi.advanceTimersByTimeAsync(300);
  expect(mocks.preview.mock.lastCall).toEqual(['instance','series',expect.objectContaining({plan:item.series!.plan,reminder:item.reminder})]);
  form.value!.submit();
  expect(submissions[1]).toMatchObject({scope:'series'});
  expect(submissions[0].kind === 'v2' && submissions[1].kind === 'v2' && submissions[0].payload.idempotencyKey !== submissions[1].payload.idempotencyKey).toBe(true);
});
