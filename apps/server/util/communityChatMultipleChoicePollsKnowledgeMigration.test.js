import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../migrations/20260827_community_chat_multiple_choice_polls_knowledge.sql',
  import.meta.url,
);

describe('聊天室多选投票帮助知识迁移', () => {
  it('说明发布模式、完整选择集和多选结果口径', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('Root 发布时可以选择单选或多选');
    expect(source).toContain('多选投票还要设置每人最多可选项数');
    expect(source).toContain('一次提交完整选择');
    expect(source).toContain('去重后的总参与人数');
    expect(source).toContain('各选项比例相加可能超过 100%');
    expect(source).toContain('不公开谁选择了哪个选项');
    expect(source).toContain('连续出现在可视区域至少 0.8 秒');
    expect(source).toContain('只进入聊天室、只露出头像昵称、快速划过或切到后台都不计入');
    expect(source).toContain('Root 点击“已读 N 人”可以按需查看成员昵称、社区 ID 和首次已读时间');
    expect(source).toContain('数量约每 8 秒自动更新');
    expect(source).toContain('不需要刷新整个页面、点击后才更新数量或切换模块');
  });

  it('沿用原帮助条目并保持幂等写入', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @community_chat_poll_receipt_help_id = 'fd9b4629-a745-4906-8b54-5cea6cb0cd48'");
    expect(source).toContain("SET @community_chat_poll_receipt_help_title = '聊天室投票和发言已读如何使用'");
    expect(source).toContain(
      'WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @community_chat_poll_receipt_help_id)',
    );
    expect(source).toContain(
      'WHERE id = @community_chat_poll_receipt_help_id OR title = @community_chat_poll_receipt_help_title',
    );
  });
});
