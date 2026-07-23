import { describe, expect, it } from 'vitest';
import { buildAgentCapabilityOverview, isAgentCapabilityOverviewRequest } from './capabilityOverview.js';

describe('capabilityOverview', () => {
  it.each(['你支持哪些工具？', '你能做什么', '轻笺智域具备什么能力？', 'What tools do you support?'])(
    '识别能力总览问法：%s',
    (message) => {
      expect(isAgentCapabilityOverviewRequest(message)).toBe(true);
    },
  );

  it('不把具体功能是否支持的问题误判成总览', () => {
    expect(isAgentCapabilityOverviewRequest('你支持删除笔记吗？')).toBe(false);
  });

  it('只声明当前实际可用的确认动作并明确能力边界', () => {
    const response = buildAgentCapabilityOverview({
      tools: [
        { name: 'query_bookmarks' },
        { name: 'create_note' },
        { name: 'set_todo_status' },
        { name: 'query_users' },
      ],
      locale: 'zh-CN',
    });

    expect(response).toContain('查询书签');
    expect(response).toContain('创建普通笔记或图片笔记');
    expect(response).toContain('完成或重新打开单条待办');
    expect(response).toContain('所有数据变更都会先展示确认');
    expect(response).toContain('暂不能直接编辑或删除已有笔记/书签');
    expect(response).toContain('管理查询');
    expect(response).not.toContain('上传、下载');
  });
});
