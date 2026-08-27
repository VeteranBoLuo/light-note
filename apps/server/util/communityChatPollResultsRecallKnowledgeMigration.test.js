import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../migrations/20260827_community_chat_poll_results_recall_knowledge.sql',
  import.meta.url,
);

describe('聊天室投票结果、已读与撤回帮助知识迁移', () => {
  it('同步投票后聚合、Root 名单、静默已读和紧凑撤回的当前事实', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('普通登录用户完成自己的首次投票后即可看到各选项票数');
    expect(source).toContain('尚未投票时不显示进行中的结果');
    expect(source).toContain('普通用户不会看到谁投了哪一项');
    expect(source).toContain('Root 可以点击投票卡片中的“投票明细”');
    expect(source).toContain('普通成员界面不显示逐消息已读提示，但记录规则不变');
    expect(source).toContain('数量约每 8 秒自动更新');
    expect(source).toContain('撤回消息会压缩为居中的系统提示');
    expect(source).toContain('Root 需要审核时可以主动展开原消息并再次收起');
  });

  it('沿用原帮助条目并保持事务内幂等写入', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain("SET @community_chat_poll_receipt_help_id = 'fd9b4629-a745-4906-8b54-5cea6cb0cd48'");
    expect(source).toContain("SET @community_chat_poll_receipt_help_title = '聊天室投票和发言已读如何使用'");
    expect(source).toContain('START TRANSACTION');
    expect(source).toContain('COMMIT');
    expect(source).toContain(
      'WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @community_chat_poll_receipt_help_id)',
    );
    expect(source).toContain(
      'WHERE id = @community_chat_poll_receipt_help_id OR title = @community_chat_poll_receipt_help_title',
    );
  });
});
