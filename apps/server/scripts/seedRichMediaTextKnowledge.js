/**
 * 同步「富文本图文组合」公开帮助条目。
 *
 * 按标题幂等：已存在则更新正文，不存在才新建，可重复执行。
 * 用法：node scripts/seedRichMediaTextKnowledge.js
 */
import pool from '../db/index.js';
import { upsertKnowledgeBase } from '../util/services/knowledgeBaseService.js';

import { RICH_MEDIA_HELP_ENTRY as entry } from '../util/helpKnowledgeRefreshContent.js';

async function main() {
  const [[root]] = await pool.query(
    "SELECT id FROM user WHERE role = 'root' AND del_flag = 0 ORDER BY create_time LIMIT 1",
  );
  if (!root?.id) throw new Error('未找到 root 用户，无法写入知识库');

  const result = await upsertKnowledgeBase({ userId: root.id, input: entry });
  console.log(`[knowledge] ${result.action} → ${result.title}`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[knowledge] 写入失败:', error?.message || error);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  });
