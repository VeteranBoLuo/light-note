import { describe, expect, it } from 'vitest';
import tools from './index.js';
import { ROUTED_AGENT_WRITE_TOOL_NAMES } from '../toolRouter.js';

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

  it('所有写工具显式声明有效风险等级和确认策略', () => {
    const writeTools = tools.filter((tool) => tool.isWrite);
    expect(writeTools.map((tool) => tool.name).sort()).toEqual(
      [
        'add_tag',
        'create_bookmark',
        'create_image_note',
        'create_note',
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
  });

  it('待办与待整理查询工具、单条待办状态写工具已注册', () => {
    for (const name of ['query_todos', 'query_inbox']) {
      expect(tools.some((tool) => tool.name === name && !tool.isWrite)).toBe(true);
    }
    const statusTool = tools.find((tool) => tool.name === 'set_todo_status');
    expect(statusTool).toMatchObject({
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      confirmationPolicy: 'always',
    });
  });
});
