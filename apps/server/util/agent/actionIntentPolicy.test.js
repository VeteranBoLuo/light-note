import { describe, expect, it } from 'vitest';
import { buildAgentActionPolicyMessage, resolveAgentActionIntent } from './actionIntentPolicy.js';

describe('Agent 动作意图安全策略', () => {
  it.each([
    ['创建一篇笔记', 'enabled', 'create_note'],
    ['帮我收藏这个链接', 'enabled', 'create_bookmark'],
    ['把待办“整理发票”标记为完成', 'enabled', 'set_todo_status'],
    ['恢复回收站里的笔记', 'enabled', 'restore_trash'],
    ['reopen task "invoice"', 'enabled', 'set_todo_status'],
  ])('%s 解析为已启用能力', (message, resolution, toolName) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({
      kind: 'action',
      resolution,
      toolNames: expect.arrayContaining([toolName]),
    });
  });

  it.each([
    ['帮我删除笔记“引用测试”', 'note.delete'],
    ['删除这个书签', 'bookmark.delete'],
    ['把云空间的旧文件删掉', 'file.delete'],
    ['修改这篇笔记的标题', 'note.update'],
    ['给这个书签添加标签', 'tag.assign'],
    ['新建一个待办提醒我明天交材料', 'todo.manage'],
  ])('%s 解析为计划中但未支持的能力', (message, capabilityId) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({
      kind: 'action',
      resolution: 'planned',
      capabilities: expect.arrayContaining([expect.objectContaining({ id: capabilityId })]),
      toolNames: [],
    });
  });

  it('显式资源上下文可以补足“删除这个”的资源语义', () => {
    expect(resolveAgentActionIntent({ message: '帮我删除这个', contextTypes: ['note'] })).toMatchObject({
      resolution: 'planned',
      capabilities: [expect.objectContaining({ id: 'note.delete' })],
    });
  });

  it.each([
    ['彻底删除全部笔记', 'data.permanent_delete'],
    ['帮我修改账号密码', 'account.security.manage'],
    ['给我增加 1000 积分', 'growth.integrity.manage'],
    ['封禁这个用户', 'admin.mutation'],
  ])('%s 解析为禁止能力', (message, capabilityId) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({
      kind: 'action',
      resolution: 'forbidden',
      capabilities: expect.arrayContaining([expect.objectContaining({ id: capabilityId })]),
    });
  });

  it.each([
    '怎么删除笔记？',
    '删除的笔记在哪里？',
    '这个待办完成了吗？',
    '帮我看看这个待办完成了吗？',
    '我目前已完成的待办有哪些？',
    '帮我查一下未完成的任务',
    '列出我创建的笔记',
    '我收藏的书签有多少？',
    '显示已经上传的文件',
    '帮我读取已删除的笔记',
    '查看已创建的标签',
    '已恢复的回收站内容有哪些？',
    '帮助中心最近更新了哪些内容？',
    '如何修改书签标题？',
    '请告诉我怎么删除笔记？',
    '帮我了解一下如何恢复删除的文件',
    'How can I delete a note?',
    'Show me my completed tasks',
    'Which tasks are already completed?',
    'Which notes have I created?',
    'List my saved bookmarks',
    'How many files have been uploaded?',
    '我刚刚删除了一篇笔记',
  ])('%s 保持为只读询问或描述', (message) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({ kind: 'query', resolution: 'none' });
  });

  it.each(['已完成待办', '未完成任务', '已删除的笔记', 'completed todos', 'deleted notes'])(
    '%s 作为状态筛选短语而不是修改命令',
    (message) => {
      expect(resolveAgentActionIntent({ message })).toMatchObject({ kind: 'query', resolution: 'none' });
    },
  );

  it.each([
    ['列出待办，然后把第一条标记为完成', 'todo.status.set'],
    ['查看笔记后再删除“周报”', 'note.delete'],
    ['restore deleted notes', 'trash.restore'],
    ['List my tasks and complete the first one', 'todo.status.set'],
  ])('%s 含后续写动作时不能被只读前半句掩盖', (message, capabilityId) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({
      kind: 'action',
      capabilities: expect.arrayContaining([expect.objectContaining({ id: capabilityId })]),
    });
  });

  it.each(['你好', '解释一下量子纠缠', '帮我写一首关于夏天的诗'])('%s 不误判为产品写操作', (message) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({ kind: 'none', resolution: 'none' });
  });

  it.each(['帮我发布这个', '请立即同步这些', '把选中的内容合并掉'])('%s 未注册修改能力失败关闭', (message) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({
      kind: 'action',
      resolution: 'unknown_mutation',
    });
  });

  it('未支持和禁止消息都明确说明没有执行', () => {
    const planned = resolveAgentActionIntent({ message: '帮我删除笔记“引用测试”' });
    const forbidden = resolveAgentActionIntent({ message: '彻底删除全部笔记' });
    expect(buildAgentActionPolicyMessage(planned, 'zh-CN')).toMatch(/暂不支持.*没有执行/s);
    expect(buildAgentActionPolicyMessage(forbidden, 'zh-CN')).toMatch(/不允许.*没有修改/s);
    expect(buildAgentActionPolicyMessage(planned, 'en-US')).toMatch(
      /does not currently support.*nothing was executed/is,
    );
  });

  it('常见动作与资源组合不得落入普通 Final Reply', () => {
    const operations = ['删除', '修改', '移动', '分享'];
    const resources = ['笔记', '书签', '文件', '标签', '待办'];
    for (const operation of operations) {
      for (const resource of resources) {
        const intent = resolveAgentActionIntent({ message: `帮我${operation}这个${resource}` });
        expect(intent.kind, `${operation} × ${resource}`).toBe('action');
        expect(intent.resolution, `${operation} × ${resource}`).not.toBe('none');
      }
    }
  });
});
