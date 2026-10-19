import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TodoItem } from '@/api/todoApi';
import { useTodoClock } from '@/composables/useTodoClock';
import { formatTodoDateTime, parseTodoDate, todoNextReminderAt, todoPastReminderAt } from '@/utils/todoPlanning';

export function useTodoReminderPresentation(getItem: () => TodoItem) {
  const { t, locale } = useI18n();
  const { now, today } = useTodoClock();
  const reminderState = computed(() => {
    const item = getItem();
    const reminder = item.reminder;
    if (item.status !== 'pending' || reminder?.mode === 'none' || (!reminder && !item.reminderAt)) {
      return { kind: 'none', at: '' } as const;
    }
    if (reminder && 'paused' in reminder && reminder.paused) return { kind: 'paused', at: '' } as const;
    // 明确为空的 nextAt 表示当前没有待投递 Job，不能把旧规则时间当成下一次提醒。
    const nextAt = reminder && 'nextAt' in reminder ? reminder.nextAt : todoNextReminderAt(item);
    const nextTime = nextAt ? parseTodoDate(nextAt).getTime() : Number.NaN;
    if (Number.isFinite(nextTime)) {
      return { kind: nextTime > now.value ? 'next' : 'past', at: nextAt! } as const;
    }
    const pastAt = todoPastReminderAt(item, new Date(now.value));
    return pastAt ? ({ kind: 'past', at: pastAt } as const) : ({ kind: 'unscheduled', at: '' } as const);
  });
  const reminderTime = computed(() =>
    reminderState.value.at
      ? formatTodoDateTime(reminderState.value.at, locale.value, {
          relative: true,
          includeYear: false,
          now: today.value,
          relativeLabels: { today: t('inbox.todoToday'), tomorrow: t('inbox.todoTomorrow') },
        })
      : '',
  );
  return { reminderState, reminderTime };
}
