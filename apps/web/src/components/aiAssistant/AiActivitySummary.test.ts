import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import AiActivitySummary from './AiActivitySummary.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountActivity(
  toolEvents: Array<{
    name: string;
    status: 'running' | 'success' | 'error' | 'confirmation_required' | 'interaction_required';
    round?: number;
  }>,
  streaming = false,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(AiActivitySummary, { toolEvents, streaming });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  );
  app.component('OriginalIcon', { render: () => h('span', { 'data-test-icon': '' }) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('AiActivitySummary', () => {
  it('单个失败合并为一条不可折叠的状态，不再声称需要用户处理', () => {
    const host = mountActivity([{ name: 'set_todo_status', status: 'error' }]);

    expect(host.textContent).toContain('修改待办状态');
    expect(host.textContent).toContain('未完成');
    expect(host.textContent).not.toContain('需要处理');
    expect(host.textContent).not.toContain('查看处理记录');
    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelectorAll('.ai-activity__card')).toHaveLength(1);
  });

  it('多个失败在同一张卡内按需展开详情', async () => {
    const host = mountActivity([
      { name: 'set_todo_status', status: 'error' },
      { name: 'create_note', status: 'error' },
    ]);
    const toggle = host.querySelector('button') as HTMLButtonElement;

    expect(host.textContent).toContain('有 2 项操作未完成');
    expect(host.textContent).toContain('查看详情');
    expect(host.querySelector('.ai-activity__details')).toBeNull();

    toggle.click();
    await Promise.resolve();

    expect(host.textContent).toContain('收起详情');
    expect(host.querySelectorAll('.ai-activity__item')).toHaveLength(2);
    expect(host.querySelectorAll('.ai-activity__card')).toHaveLength(1);
  });

  it('成功、等待确认和等待选择不生成重复的失败状态卡', () => {
    const host = mountActivity([
      { name: 'query_todos', status: 'success' },
      { name: 'set_todo_status', status: 'confirmation_required' },
      { name: 'set_todo_status', status: 'interaction_required' },
    ]);

    expect(host.querySelector('.ai-activity')).toBeNull();
  });

  it('流式回答期间不让失败终态卡先于解释正文出现', () => {
    const host = mountActivity([{ name: 'set_todo_status', status: 'error' }], true);

    expect(host.querySelector('.ai-activity')).toBeNull();
    expect(host.textContent).not.toContain('未完成');
  });
});
