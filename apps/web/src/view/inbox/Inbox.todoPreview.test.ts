import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const inboxSource = readFileSync(resolve(process.cwd(), 'src/view/inbox/Inbox.vue'), 'utf8');
const todoItemSource = readFileSync(resolve(process.cwd(), 'src/components/todo/TodoItem.vue'), 'utf8');
const scheduleSource = readFileSync(resolve(process.cwd(), 'src/components/todo/TodoScheduleView.vue'), 'utf8');
const matrixSource = readFileSync(resolve(process.cwd(), 'src/components/todo/TodoMatrixView.vue'), 'utf8');
const seriesGroupSource = readFileSync(resolve(process.cwd(), 'src/components/todo/TodoSeriesGroup.vue'), 'utf8');

describe('Inbox todo preview integration', () => {
  it('列表、议程、日历、四象限和系列默认点击统一发出 preview', () => {
    expect(todoItemSource).toContain("emit('preview')");
    expect(scheduleSource).toContain("$emit('preview', item)");
    expect(scheduleSource).toContain("emit('preview', item)");
    expect(matrixSource).toContain('@click="emit(\'preview\', item)"');
    expect(seriesGroupSource).toContain('@preview="emit(\'preview\', representative)"');
  });

  it('待办页统一挂载详情抽屉，并复用页面级编辑与删除编排', () => {
    expect(inboxSource).toContain('<TodoPreviewDrawer');
    expect(inboxSource).toContain('@preview="openTodoPreview"');
    expect(inboxSource).toContain('@edit="openTodoEditor"');
    expect(inboxSource).toContain('@delete="confirmDeleteTodo"');
    expect(inboxSource).toContain(':deleting="deletingTodoId === previewTodo.id"');
    expect(inboxSource).toContain('@closed="clearTodoPreview"');
    expect(inboxSource).toMatch(/function openTodoPreview[\s\S]*?todoPreviewVisible\.value = true/);
  });

  it('删除成功后关闭当前详情，普通待办与系列仍走既有确认分支', () => {
    expect(inboxSource).toMatch(
      /function confirmDeleteTodo[\s\S]*?todoSeriesDeleteChoice[\s\S]*?removeTodoV2[\s\S]*?deleteTodoConfirm[\s\S]*?removeTodo\(item\)/,
    );
    expect(inboxSource).toMatch(
      /async function removeTodo\([\s\S]*?result === true[\s\S]*?closeTodoPreview\(item\.id\)[\s\S]*?showTodoUndo/,
    );
    expect(inboxSource).toMatch(
      /async function removeTodoV2[\s\S]*?scope === 'current' \|\| item\.status === 'pending'[\s\S]*?closeTodoPreview\(item\.id\)/,
    );
  });

  it('搜索 todoId 深链先清理查询参数，再打开详情而不是编辑器', () => {
    expect(inboxSource).toMatch(
      /async function openRequestedTodo[\s\S]*?delete query\.todoId;[\s\S]*?delete query\.focusRef;[\s\S]*?await router\.replace\(\{ query \}\);[\s\S]*?openTodoPreview\(requestedTodo, requestedFocusRef\)/,
    );
    expect(inboxSource).not.toMatch(/openRequestedTodo[\s\S]{0,800}openTodoEditor\(requestedTodo\)/);
  });

  it('待办反链深链会把 focusRef 交给详情抽屉后清理临时查询参数', () => {
    expect(inboxSource).toContain(':focus-ref="previewTodoFocusRef"');
    expect(inboxSource).toMatch(
      /const requestedFocusRef = String\(route\.query\.focusRef \|\| ''\);[\s\S]*?delete query\.focusRef;[\s\S]*?openTodoPreview\(requestedTodo, requestedFocusRef\)/,
    );
    expect(inboxSource).toMatch(/function clearTodoPreview[\s\S]*?previewTodoFocusRef\.value = ''/);
  });
});
