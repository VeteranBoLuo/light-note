import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { TOOLBOX_HOME_GROUPS } from '@/config/toolbox';

const source = readFileSync(resolve(process.cwd(), 'src/view/toolbox/ToolboxHome.vue'), 'utf8');
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
const ast = ts.createSourceFile('home.ts', script, ts.ScriptTarget.Latest, true);
const names = new Set([
  'continueWorkspaces',
  'continueJobs',
  'attentionJob',
  'needsAttention',
  'isReadyTask',
  'dateValue',
  'taskAttentionSummary',
]);
const statements = ast.statements.filter((node) =>
  ts.isFunctionDeclaration(node)
    ? names.has(node.name?.text || '')
    : ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => names.has(d.name.getText(ast))),
);
const executable = ts.transpile(statements.map((node) => node.getText(ast)).join('\n'), {
  target: ts.ScriptTarget.ES2022,
});
function overview(data: unknown) {
  return new Function(
    'computed',
    'overview',
    't',
    `${executable}; return {continueWorkspaces, continueJobs, attentionJob, taskAttentionSummary};`,
  )(computed, ref(data), (key: string, params: { count: number }) => `${key}:${params.count}`);
}
const job = (id: string, status = 'running', ready = false) => ({
  id,
  status,
  artifactState: ready ? 'ready' : 'none',
  save: { status: 'unsaved' },
});
describe('工坊概览展示优先级', () => {
  it('按活动时间取最近四个进行中项目，不修改源数组', () => {
    const projects = Array.from({ length: 6 }, (_, i) => ({
      id: i,
      status: 'active',
      updatedAt: 100 + i,
      lastOpenedAt: i === 0 ? 200 : undefined,
    }));
    const state = overview({ workspaces: { continue: [...projects, { id: 9, status: 'archived', updatedAt: 300 }] } });
    expect(state.continueWorkspaces.value.map((p: { id: number }) => p.id)).toEqual([0, 5, 4, 3]);
    expect(projects.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('先去重再优先展示失败、待保存任务，保留正常运行任务', () => {
    const ready = job('ready', 'succeeded', true);
    const state = overview({
      tasks: {
        active: [job('running'), job('running2')],
        ready: [ready],
        recent: [ready, job('failed', 'failed'), job('saved', 'succeeded')],
      },
    });
    expect(state.continueJobs.value.map((j: { id: string }) => j.id)).toEqual(['ready', 'failed', 'running']);
    expect(state.attentionJob.value.id).toBe('ready');
    expect(state.taskAttentionSummary.value).toBe('toolbox.home.readyTaskCount:1 · toolbox.home.failedTaskCount:1');
  });
  it('仅运行中或空数据时不提供待处理提醒', () => {
    expect(overview({ tasks: { active: [job('running')] } }).attentionJob.value).toBeUndefined();
    expect(overview(null).attentionJob.value).toBeUndefined();
  });
});

describe('工坊目录与任务呈现', () => {
  function evaluateDeclaration(name: string, bindings: Record<string, unknown>) {
    const selected = ast.statements.filter((node) =>
      ts.isFunctionDeclaration(node)
        ? node.name?.text === name
        : ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => d.name.getText(ast) === name),
    );
    const js = ts.transpile(selected.map((node) => node.getText(ast)).join('\n'), { target: ts.ScriptTarget.ES2022 });
    return new Function(...Object.keys(bindings), `${js}; return ${name};`)(...Object.values(bindings));
  }
  it('只合并三个项目模板，保留公开收集；空分组随搜索结果移除', () => {
    const tools = ref(
      ['research_workspace', 'learning_workspace', 'writing_workspace', 'forms', 'pdf_organizer'].map((id) => ({ id })),
    );
    const groups = evaluateDeclaration('visibleGroups', { computed, visibleTools: tools, TOOLBOX_HOME_GROUPS });
    expect(
      groups.value
        .find((group: { id: string }) => group.id === 'workspace')
        .tools.map((tool: { id: string }) => tool.id),
    ).toEqual(['research_workspace', 'forms']);
    tools.value = [{ id: 'pdf_organizer' }];
    expect(groups.value.map((group: { id: string }) => group.id)).toEqual(['prepare']);
    tools.value = [];
    expect(groups.value).toEqual([]);
  });
  it('失败和保存失败不能继续承诺任务正在处理', () => {
    const describeTask = evaluateDeclaration('taskContinueDescription', {
      t: (key: string) => key,
      isReadyTask: (job: { artifactState: string }) => job.artifactState === 'ready',
    });
    expect(describeTask(job('failed', 'failed'))).toBe('toolbox.task.processingFailed');
    expect(describeTask({ ...job('save', 'succeeded', true), save: { status: 'save_failed' } })).toBe(
      'toolbox.task.saveFailed',
    );
    expect(describeTask({ ...job('retry', 'queued'), stage: 'retrying' })).toBe('toolbox.task.retryingTitle');
    expect(describeTask(job('ready', 'succeeded', true))).toBe('toolbox.home.resultReadyDescription');
    expect(describeTask(job('queued', 'queued'))).toBe('toolbox.task.queued');
    expect(describeTask(job('working', 'processing'))).toBe('toolbox.home.processingDescription');
  });
});
