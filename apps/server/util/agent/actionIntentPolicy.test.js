import { describe, expect, it } from 'vitest';
import { buildAgentActionPolicyMessage, resolveAgentActionIntent } from './actionIntentPolicy.js';

describe('Agent 动作意图安全策略', () => {
  it.each([
    ['创建一篇笔记', 'enabled', 'create_note'],
    ['帮我收藏这个链接', 'enabled', 'create_bookmark'],
    ['把待办“整理发票”标记为完成', 'enabled', 'set_todo_status'],
    ['恢复回收站里的笔记', 'enabled', 'restore_trash'],
    ['reopen task "invoice"', 'enabled', 'set_todo_status'],
    ['把刚才那个待办删掉', 'enabled', 'delete_todo'],
    ['delete task "invoice"', 'enabled', 'delete_todo'],
    ['新建一个待办提醒我明天交材料', 'enabled', 'create_todo'],
    ['创建一个今天晚上 21 点的待办', 'enabled', 'create_todo'],
    ['add a task to review the draft', 'enabled', 'create_todo'],
    ['创建一个每天 14 点、共 30 天的学习任务', 'enabled', 'create_todo_plan'],
    ['帮我安排完成后 1 天再次生成的任务', 'enabled', 'create_todo_plan'],
    ['set up a weekly recurring task', 'enabled', 'create_todo_plan'],
  ])('%s 解析为已启用能力', (message, resolution, toolName) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({
      kind: 'action',
      resolution,
      toolNames: expect.arrayContaining([toolName]),
    });
  });

  it('复杂计划只路由到完整计划工具，不降级成普通待办或误判为完成任务', () => {
    expect(resolveAgentActionIntent({ message: '帮我安排完成后 1 天再次生成的任务' })).toMatchObject({
      resolution: 'enabled',
      toolNames: ['create_todo_plan'],
    });
  });

  it.each([
    ['帮我删除笔记“引用测试”', 'note.delete'],
    ['删除这个书签', 'bookmark.delete'],
    ['把云空间的旧文件删掉', 'file.delete'],
    ['修改这篇笔记的标题', 'note.update'],
    ['给这个书签添加标签', 'tag.assign'],
    ['修改这条待办的标题', 'todo.manage'],
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
    ['清空所有待办', 'data.permanent_delete'],
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
    '帮我回顾很久没看的收藏',
    '帮我分析下我的收藏',
    '帮我总结最近收藏的书签',
    '帮我复盘本月新增的笔记',
    '帮我总结最近创建的笔记',
    '帮我对比最近两个文件',
    '帮我推荐一些很久没看的书签',
    '帮助中心最近更新了哪些内容？',
    '如何修改书签标题？',
    '如何收藏一个链接？',
    '怎么把笔记删除？',
    '请告诉我怎么删除笔记？',
    '帮我了解一下如何恢复删除的文件',
    'How can I delete a note?',
    'How can I bookmark a link?',
    'Please summarize my saved bookmarks',
    'Could you review bookmarks I saved a long time ago?',
    'Show me my completed tasks',
    'Which tasks are already completed?',
    'Which notes have I created?',
    'List my saved bookmarks',
    'How many files have been uploaded?',
    '我刚刚删除了一篇笔记',
  ])('%s 保持为只读询问或描述', (message) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({ kind: 'query', resolution: 'none' });
  });

  it.each([
    '分析内容，生成一份笔记',
    '分析一下这个网页的内容，生成一份笔记',
    '总结这条书签并生成笔记',
    '请分析这个书签的内容，生成一篇笔记。',
    '请根据这个待办生成一篇发布记录笔记。',
    '请把下面的文字整理成一篇笔记。',
  ])('%s 不能被前半句的只读动词吞掉后半句写动作', (message) => {
    expect(resolveAgentActionIntent({ message, contextTypes: ['bookmark'] })).toMatchObject({
      kind: 'action',
      resolution: 'enabled',
      toolNames: expect.arrayContaining(['create_note']),
    });
  });

  it.each([
    '分析已创建的笔记，修改时间是什么？',
    '总结收藏的书签，保存时间有哪些？',
    '查看文件，上传时间是多少？',
    '查看笔记，更新记录有哪些？',
    '分析内容，写笔记有哪些建议？',
    '分析内容，生成笔记怎么操作？',
    '分析内容，创建笔记的入口在哪里？',
  ])('%s 不会把逗号后的元数据或教程问句误判成动作', (message) => {
    expect(resolveAgentActionIntent({ message, contextTypes: ['bookmark'] })).not.toMatchObject({
      kind: 'action',
    });
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
    ['帮我回顾收藏并删除失效书签', 'bookmark.delete'],
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

  it.each([
    ['我想删除笔记“周报”', 'note.delete'],
    ['能不能帮我删除这篇笔记', 'note.delete'],
    ['Could you delete this bookmark?', 'bookmark.delete'],
    ['I want to delete my note', 'note.delete'],
  ])('%s 的委托/意愿句仍识别为真实修改', (message, capabilityId) => {
    expect(resolveAgentActionIntent({ message })).toMatchObject({
      kind: 'action',
      capabilities: expect.arrayContaining([expect.objectContaining({ id: capabilityId })]),
    });
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
