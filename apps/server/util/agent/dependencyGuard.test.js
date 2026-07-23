import { describe, expect, it } from 'vitest';
import { enforceToolDependencyBindings, normalizeToolDependencyRefs } from './dependencyGuard.js';

const tool = {
  isWrite: true,
  dependencyBindings: [{ argument: 'todoId', refType: 'todo', requireUnique: true }],
  normalizeArgs(args) {
    const raw = String(args.todoId || '').trim();
    const marker = /^\[?todo:([^\]\s]+)\]?$/i.exec(raw);
    return { todoId: marker?.[1] || raw };
  },
};

describe('Agent 依赖目标绑定', () => {
  it('只接受读取工具提供的结构化引用，并去重无效项', () => {
    expect(
      normalizeToolDependencyRefs([
        { type: 'todo', id: 'todo-1' },
        { type: 'todo', id: 'todo-1' },
        { type: 'TODO', id: 'todo-2' },
        { type: 'bad type', id: 'x' },
      ]),
    ).toEqual([
      { type: 'todo', id: 'todo-1' },
      { type: 'todo', id: 'todo-2' },
    ]);
  });

  it('模型使用本轮查询返回的标记时归一为真实 ID', () => {
    expect(enforceToolDependencyBindings(tool, { todoId: '[todo:todo-1]' }, [{ type: 'todo', id: 'todo-1' }])).toEqual({
      todoId: 'todo-1',
    });
  });

  it('缺失目标或使用本轮结果之外的 ID 时失败关闭', () => {
    expect(() => enforceToolDependencyBindings(tool, {}, [{ type: 'todo', id: 'todo-1' }])).toThrow(
      expect.objectContaining({ code: 'TOOL_DEPENDENCY_TARGET_REQUIRED' }),
    );
    expect(() =>
      enforceToolDependencyBindings(tool, { todoId: 'todo-other' }, [{ type: 'todo', id: 'todo-1' }]),
    ).toThrow(expect.objectContaining({ code: 'TOOL_DEPENDENCY_TARGET_MISMATCH' }));
  });

  it('单目标写入的前置查询返回多个候选时禁止模型自行挑选', () => {
    expect(() =>
      enforceToolDependencyBindings(tool, { todoId: 'todo-1' }, [
        { type: 'todo', id: 'todo-1' },
        { type: 'todo', id: 'todo-2' },
      ]),
    ).toThrow(
      expect.objectContaining({
        code: 'TOOL_DEPENDENCY_TARGET_AMBIGUOUS',
        message: expect.stringContaining('多个可能目标'),
      }),
    );
  });

  it('同一绑定机制也约束依赖读取，不把标题或历史中的其他 ID 当成目标', () => {
    const readTool = {
      dependencyBindings: [{ argument: 'noteId', refType: 'note' }],
      normalizeArgs: (args) => ({ noteId: String(args.noteId || '').trim() }),
    };
    expect(() =>
      enforceToolDependencyBindings(readTool, { noteId: 'note-other' }, [{ type: 'note', id: 'note-1' }]),
    ).toThrow(
      expect.objectContaining({
        code: 'TOOL_DEPENDENCY_TARGET_MISMATCH',
        message: expect.stringContaining('未读取其他数据'),
      }),
    );
  });
});
