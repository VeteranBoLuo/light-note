import { expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import Preview from './TodoPlanPreviewCard.vue';
import zhCN from '@/i18n/locales/zh-CN';
it('预览显示归属、标签、资料与次日截止，更新中仍保留计划内容', () => {
  const host = document.createElement('div');
  const app = createApp({ render: () => h(Preview, {
    task: { title: '跨夜任务', priority: 1 },
    organization: { listName: '开发', tags: [{id: 'tag1', name: '产品'}] },
    resources: [{ type: 'note', id: 'note1', title: '需求说明', available: true }],
    dueNextDay: true,
    loading: true,
    preview: { displaySummary: { title: '每日任务', range: '日期范围', timing: '09:00 开始 · 22:00 截止', reminder: '不提醒' }, occurrenceCount: 3, generatedNowCount: 3, reminderJobCount: 0 } as any,
  }) });
  app.use(createI18n({legacy: false, locale: 'zh-CN', messages: {'zh-CN': zhCN}}));
  app.mount(host);
  try {
    for (const text of ['开发', '产品', '需求说明', '次日截止', '每日任务']) expect(host.textContent).toContain(text);
    expect(host.querySelector('.todo-plan-preview__schedule')).not.toBeNull();
  } finally { app.unmount(); }
});

it.each([true, false])('区分长期提醒与有限次数：ongoing=%s', (ongoing) => {
  const host = document.createElement('div');
  const app = createApp({ render: () => h(Preview, {
    preview: { displaySummary: { title: '打卡', range: '无日期', timing: '', reminder: '每周一到周五提醒' }, occurrenceCount: 1, reminderJobCount: 43, reminderIsOngoing: ongoing } as any,
  }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  try {
    expect(host.textContent).toContain(ongoing ? '长期有效' : '43');
    expect(host.textContent).toContain(ongoing ? '重复期限' : '提醒次数');
    expect(host.textContent).not.toContain(ongoing ? '43' : '长期有效');
  } finally { app.unmount(); }
});
