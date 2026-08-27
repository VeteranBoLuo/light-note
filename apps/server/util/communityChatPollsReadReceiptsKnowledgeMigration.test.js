import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../migrations/20260826_community_chat_polls_read_receipts_knowledge.sql',
  import.meta.url,
);

describe('聊天室投票与逐消息已读帮助知识迁移', () => {
  it('说明 Root 权限、结果隐私与已读语义边界', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('“发起投票”和“统计这条发言的已读人数”只对 Root 开放');
    expect(source).toContain('普通登录用户可以参与尚未结束的单选投票');
    expect(source).toContain('不公开谁选择了哪个选项');
    expect(source).toContain('新发送的 Root 消息和投票会自动统计');
    expect(source).toContain('重复查看不会重复增加');
    expect(source).toContain('不代表用户理解、同意或完成了其中的事项');
    expect(source).toContain('既有历史和聚合数不会被删除');
  });

  it('以公开帮助条目幂等写入知识库', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @community_chat_poll_receipt_help_title = '聊天室投票和发言已读如何使用'");
    expect(source).toContain("'帮助中心', 'public', 'html', 923");
    expect(source).toContain(
      'WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @community_chat_poll_receipt_help_id)',
    );
    expect(source).toContain(
      'AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @community_chat_poll_receipt_help_title)',
    );
    expect(source).toContain(
      'WHERE id = @community_chat_poll_receipt_help_id OR title = @community_chat_poll_receipt_help_title',
    );
  });
});
