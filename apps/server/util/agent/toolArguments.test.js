import { describe, expect, it } from 'vitest';
import {
  getPlannerMaxTokens,
  normalizeToolArguments,
  parseToolCallArguments,
  prepareToolArguments,
} from './toolArguments.js';

describe('Agent 工具参数处理', () => {
  it('解析标准 JSON 与供应商直接返回的对象参数', () => {
    expect(parseToolCallArguments({ function: { arguments: '{"title":"日报"}' } })).toEqual({
      ok: true,
      args: { title: '日报' },
    });
    expect(parseToolCallArguments({ function: { arguments: { title: '周报' } } })).toEqual({
      ok: true,
      args: { title: '周报' },
    });
  });

  it('非空但被截断的 JSON 显式失败，不再静默变成空对象', () => {
    expect(parseToolCallArguments({ function: { arguments: '{"title":"日报","content":"未结束' } })).toMatchObject({
      ok: false,
      args: {},
      error: 'TOOL_ARGUMENTS_INVALID',
    });
  });

  it('工具归一化结果必须仍为对象', () => {
    expect(normalizeToolArguments({ normalizeArgs: (args) => ({ title: args.name }) }, { name: '日报' })).toEqual({
      title: '日报',
    });
    expect(() => normalizeToolArguments({ normalizeArgs: () => null }, {})).toThrow(/TOOL_ARGUMENTS_INVALID/);
  });

  it('工具可在归一化后异步解析账号内参数', async () => {
    const tool = {
      normalizeArgs: (args) => ({ folderName: String(args.folder_name || '').trim() }),
      prepareArgs: async (args, ctx) => ({ ...args, folderId: ctx.folderId }),
    };
    await expect(prepareToolArguments(tool, { folder_name: '项目资料' }, { folderId: 'folder-1' })).resolves.toEqual({
      folderName: '项目资料',
      folderId: 'folder-1',
    });
  });

  it('异步参数准备必须返回对象', async () => {
    await expect(prepareToolArguments({ prepareArgs: async () => null }, {})).rejects.toThrow(/TOOL_ARGUMENTS_INVALID/);
  });

  it('仅对明确创建笔记或带附件的笔记请求扩大 Planner 输出预算', () => {
    const tools = new Set(['query_notes', 'create_note']);
    expect(getPlannerMaxTokens({ message: '把这个文件整理成笔记', attachmentCount: 1, selectedToolNames: tools })).toBe(
      4096,
    );
    expect(getPlannerMaxTokens({ message: '帮我写一篇笔记', selectedToolNames: tools })).toBe(4096);
    expect(getPlannerMaxTokens({ message: '我有哪些笔记', selectedToolNames: tools })).toBe(1200);
  });
});
