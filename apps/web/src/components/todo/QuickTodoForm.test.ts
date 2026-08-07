import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import QuickTodoForm from './QuickTodoForm.vue';

let cleanup: (() => void) | undefined;

function mountQuickTodoForm() {
  const onSubmit = vi.fn();
  const onDetails = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(QuickTodoForm, { onSubmit, onDetails });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          inbox: {
            quickTodoHeading: '快速新建待办',
            quickTodoHint: '只写标题也能创建',
            todoTitle: '标题',
            todoTitlePlaceholder: '输入需要完成的事情',
            quickTodoEnterHint: '按 Enter 立即创建',
            quickTodoDue: '安排到',
            quickTodoNoDate: '无日期',
            quickTodoToday: '今天',
            quickTodoTomorrow: '明天',
            quickTodoDetails: '完善详情',
            quickTodoCreate: '立即创建',
            todoPriority: '优先级',
            todoPriority0: '低',
            todoPriority1: '普通',
            todoPriority2: '高',
          },
          common: {
            noMatch: '无匹配项',
            pleaseSelect: '请选择',
            searchPlaceholder: '搜索',
          },
        },
      },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onSubmit, onDetails };
}

async function setTitle(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input');
  expect(input).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

function clickButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button).not.toBeUndefined();
  button!.click();
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('QuickTodoForm', () => {
  it('空标题不能直接创建，但仍可进入完整编辑器', async () => {
    const { host, onSubmit, onDetails } = mountQuickTodoForm();

    clickButton(host, '立即创建');
    clickButton(host, '完善详情');
    await nextTick();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onDetails).toHaveBeenCalledWith({ title: '', priority: 1, dueAt: null });
  });

  it('只填写标题即可创建，并把快捷日期带入待办草稿', async () => {
    const { host, onSubmit } = mountQuickTodoForm();
    await setTitle(host, '整理本周读书笔记');
    clickButton(host, '明天');
    clickButton(host, '立即创建');
    await nextTick();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload.title).toBe('整理本周读书笔记');
    expect(payload.priority).toBe(1);
    expect(payload.dueAt).toMatch(/^\d{4}-\d{2}-\d{2}T17:00$/);
  });
});
