import { describe, expect, it } from 'vitest';
import tools from './index.js';
import { ROUTED_AGENT_WRITE_TOOL_NAMES } from '../toolRouter.js';
import { normalizeToolArguments } from '../toolArguments.js';
import { validateToolArgumentsAgainstSchema } from '../toolPolicy.js';

describe('Agent 工具注册表', () => {
  it('可独立导入且工具名称唯一、schema 与执行器完整', () => {
    expect(tools.length).toBeGreaterThan(0);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length);
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.parameters?.type).toBe('object');
      expect(typeof tool.execute).toBe('function');
      expect(typeof tool.transform).toBe('function');
    }
  });

  it('所有无必填参数工具的空输入归一化后仍满足自身 Schema', () => {
    for (const tool of tools.filter((item) => !(item.parameters?.required || []).length)) {
      const normalized = normalizeToolArguments(tool, {});
      expect(
        () => validateToolArgumentsAgainstSchema(tool.parameters, normalized),
        `${tool.name} 的 normalizeArgs({}) 不能制造 Schema 非法值`,
      ).not.toThrow();
    }
  });

  it('所有写工具显式声明有效风险等级和确认策略', () => {
    const writeTools = tools.filter((tool) => tool.isWrite);
    expect(writeTools.map((tool) => tool.name).sort()).toEqual(
      [
        'add_tag',
        'create_bookmark',
        'create_image_note',
        'create_note',
        'create_todo',
        'create_todo_plan',
        'delete_todo',
        'restore_trash',
        'save_attachment_to_cloud',
        'set_todo_status',
        'write_knowledge_base',
      ].sort(),
    );
    for (const tool of writeTools) {
      expect(['low', 'medium', 'high']).toContain(tool.riskLevel);
      expect(['default', 'always']).toContain(tool.confirmationPolicy);
      expect(ROUTED_AGENT_WRITE_TOOL_NAMES).toContain(tool.name);
    }
  });

  it('附件直达工具声明服务端预处理，且文件夹查询已注册', () => {
    expect(tools.some((tool) => tool.name === 'query_cloud_folders' && !tool.isWrite)).toBe(true);
    for (const name of ['save_attachment_to_cloud', 'create_image_note', 'create_bookmark']) {
      const tool = tools.find((item) => item.name === name);
      expect(tool?.directAction).toBe(true);
      expect(typeof tool?.prepareArgs).toBe('function');
      expect(typeof tool?.preview).toBe('function');
    }
    for (const name of ['save_attachment_to_cloud', 'create_image_note']) {
      expect(tools.find((tool) => tool.name === name)?.resourceBindings).toEqual([
        { argument: 'attachmentId', refType: 'attachment', sourceField: 'id' },
      ]);
    }
    expect(tools.find((tool) => tool.name === 'read_url')?.resourceBindings).toEqual([
      { argument: 'url', refTypes: ['bookmark', 'web'], sourceField: 'url', allowLiteral: true },
    ]);
  });

  it('待办计划预览、待办与待整理查询工具、单条待办状态与删除工具已注册', () => {
    for (const name of ['preview_todo_plan', 'query_todos', 'query_inbox']) {
      expect(tools.some((tool) => tool.name === name && !tool.isWrite)).toBe(true);
    }
    expect(tools.find((tool) => tool.name === 'create_todo_plan')).toMatchObject({
      isWrite: true,
      directAction: true,
      riskLevel: 'medium',
      confirmationPolicy: 'always',
    });
    const statusTool = tools.find((tool) => tool.name === 'set_todo_status');
    expect(statusTool).toMatchObject({
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      confirmationPolicy: 'always',
      dependencyBindings: [{ argument: 'todoId', refType: 'todo', requireUnique: true }],
    });
    expect(tools.find((tool) => tool.name === 'delete_todo')).toMatchObject({
      isWrite: true,
      directAction: true,
      riskLevel: 'medium',
      confirmationPolicy: 'always',
      dependencyBindings: [{ argument: 'todoId', refType: 'todo', requireUnique: true }],
    });
  });

  it('死链体检同时提供历史查询与真实任务启动，并以结构化卡片投影结果', () => {
    const query = tools.find((tool) => tool.name === 'query_link_health');
    const start = tools.find((tool) => tool.name === 'start_link_health_check');
    expect(query?.description).toContain('不会启动新体检');
    expect(query?.description).toContain('必须使用 start_link_health_check');
    expect(start?.description).toContain('真实死链体检');
    expect(start?.description).toContain('我有哪些失效链接');
    expect(start?.isWrite).not.toBe(true);
    expect(start?.sideEffectPolicy).toBe('idempotent_background_job');
    expect(start?.toArtifacts({ runId: 'run-1', running: true, total: 10, checked: 2 })[0]).toMatchObject({
      id: 'bookmark-health:run-1',
      status: 'running',
      data: { jobType: 'bookmark_health', total: 10, checked: 2 },
    });
  });

  it('列表到详情的依赖工具从 raw 结果提供结构化引用，不解析标题文本', () => {
    const queryNotes = tools.find((tool) => tool.name === 'query_notes');
    const readNote = tools.find((tool) => tool.name === 'read_note');
    expect(queryNotes.getDependencyRefs({ items: [{ id: 'note-1', title: '[note:note-other]' }] })).toEqual([
      { type: 'note', id: 'note-1' },
    ]);
    expect(readNote.dependencyBindings).toEqual([{ argument: 'noteId', refType: 'note' }]);
  });
});
