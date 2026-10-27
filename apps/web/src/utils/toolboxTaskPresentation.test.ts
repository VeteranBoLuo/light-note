import { expect, it } from 'vitest';
import type { ComposerTranslation } from 'vue-i18n';
import type { ToolboxJob } from '@/api/toolbox';
import { toolboxTaskTitle, toolboxTaskStateLabel, toolboxTaskCanDismiss } from './toolboxTaskPresentation';
const labels = { 'toolbox.tool.material_to_note.name': '资料转笔记', 'toolbox.taskList.saveFailedStatus': '保存失败' };
const t = ((key: string) => labels[key] || key) as ComposerTranslation;
const job = {
  id: 'job',
  toolId: 'material_to_note',
  title: '',
  status: 'failed',
  createdAt: '2026-08-29T02:48:00Z',
  save: { status: 'unsaved' },
  artifact: null,
  artifactState: 'none',
} as ToolboxJob;
it('identifies failure by saved material or goal, with tool and time only as an honest fallback', () => {
  expect(toolboxTaskTitle({ ...job, title: '阅读摘记' }, t, 'zh-CN')).toBe('阅读摘记');
  const fallback = toolboxTaskTitle(job, t, 'zh-CN');
  expect(fallback).toContain('资料转笔记');
  expect(fallback).toContain('8月29日');
  expect(toolboxTaskTitle({ ...job, createdAt: 'invalid' }, t, 'zh-CN')).toBe('资料转笔记');
});
it('distinguishes failed saving from a ready result and protects running/saving tasks from dismissal', () => {
  expect(
    toolboxTaskStateLabel({ ...job, status: 'succeeded', save: { status: 'save_failed' }, artifactState: 'ready' }, t),
  ).toBe('保存失败');
  expect(toolboxTaskCanDismiss(job)).toBe(true);
  expect(toolboxTaskCanDismiss({ ...job, dismissed: true })).toBe(false);
  expect(toolboxTaskCanDismiss({ ...job, status: 'processing' })).toBe(false);
  expect(toolboxTaskCanDismiss({ ...job, save: { status: 'saving' } })).toBe(false);
});
