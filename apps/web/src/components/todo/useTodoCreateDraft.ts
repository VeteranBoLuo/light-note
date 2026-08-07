import { reactive } from 'vue';
import { generateUUID } from '@/utils/common';
import { toTodoLocalInput } from '@/utils/todoPlanning';
import type { TodoCreateInitialValues, TodoItem } from '@/api/todoApi';
import { applyQuickPreset, suggestTodoPlanEndDate, type TodoCreateDraftV3 } from './todoDraftNormalizer';

function baseDraft(): TodoCreateDraftV3 {
  return {
    task: {
      title: '',
      description: '',
      priority: 1,
      checklist: [{ id: generateUUID(), text: '', done: false }],
      contextRefs: [],
    },
    timing: { startAt: null, dueAt: null, timezone: 'Asia/Shanghai' },
    reminder: { version: 1, mode: 'none', channels: [] },
    independentTasks: {
      enabled: false,
      plan: {
        type: 'scheduled',
        frequency: 'daily',
        interval: 1,
        end: { mode: 'until', untilDate: suggestTodoPlanEndDate() },
      },
      reminder: {
        mode: 'once_per_instance',
        trigger: { type: 'at_start' },
        channels: ['in_app'],
        quietPolicy: 'defer_once',
      },
    },
  };
}

export function useTodoCreateDraft() {
  const draft = reactive<TodoCreateDraftV3>(baseDraft());

  function reset(item?: TodoItem | null, initial?: TodoCreateInitialValues) {
    const next = baseDraft();
    next.task.title = item?.title || initial?.title || '';
    next.task.description = item?.description || initial?.description || '';
    next.task.priority = item?.priority ?? initial?.priority ?? 1;
    next.task.checklist = (item?.checklist || initial?.checklist || next.task.checklist).map((entry) => ({ ...entry }));
    next.task.contextRefs = (item?.resourceRefs || []).map(({ type, id }) => ({ type, id }));
    next.timing.startAt = toTodoLocalInput(item?.startAt) || null;
    next.timing.dueAt = toTodoLocalInput(item?.dueAt || initial?.dueAt) || null;
    next.timing.timezone = item?.instanceTimezone || 'Asia/Shanghai';
    if (item?.planVersion === 2 && !item.seriesId && item.reminder && 'version' in item.reminder) {
      next.reminder = JSON.parse(JSON.stringify(item.reminder));
    }
    applyQuickPreset(next, initial);
    Object.assign(draft.task, next.task);
    Object.assign(draft.timing, next.timing);
    for (const key of Object.keys(draft.reminder)) delete (draft.reminder as any)[key];
    Object.assign(draft.reminder, next.reminder);
    Object.assign(draft.independentTasks, next.independentTasks);
  }

  return { draft, reset };
}
