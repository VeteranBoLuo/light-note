import { createRetryableModuleLoader } from '@/utils/retryableModuleLoader';

const load = createRetryableModuleLoader(
  () => import('@/components/todo/TodoEditorModal.vue'),
  [/^\/assets\/TodoEditorModal-[\w-]+\.js$/, /^\/src\/components\/todo\/TodoEditorModal\.vue$/],
);

export function loadTodayTodoEditor() {
  return load().then((module) => module.default);
}
