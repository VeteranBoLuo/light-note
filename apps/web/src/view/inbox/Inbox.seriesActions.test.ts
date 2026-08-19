import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';

const inboxSource = readFileSync(resolve(process.cwd(), 'src/view/inbox/Inbox.vue'), 'utf8');

describe('待办系列操作契约', () => {
  it('暂停整个系列需要二次确认，恢复和跳过保持直接操作', () => {
    const handler = inboxSource.slice(
      inboxSource.indexOf('function handleTodoSeriesAction'),
      inboxSource.indexOf('\n  }\n</script>', inboxSource.indexOf('function handleTodoSeriesAction')) + 4,
    );

    expect(handler).toContain("if (action !== 'pause')");
    expect(handler).toContain('Alert.alert({');
    expect(handler).toContain("title: t('inbox.todoSeriesPause')");
    expect(handler).toContain("content: t('inbox.todoSeriesPauseConfirm')");
    expect(handler).toContain('onOk: () => runTodoSeriesAction(item, action)');
  });

  it('中英文确认文案都说明暂停影响与可恢复性', () => {
    expect(zhCN.inbox.todoSeriesPauseConfirm).toContain('未触发的提醒会暂停');
    expect(zhCN.inbox.todoSeriesPauseConfirm).toContain('可随时恢复系列');
    expect(enUS.inbox.todoSeriesPauseConfirm).toContain('unsent reminders will be paused');
    expect(enUS.inbox.todoSeriesPauseConfirm).toContain('resume the series at any time');
  });
});
