/**
 * 同步「数据与备份」的帮助中心与 AI 知识库条目。
 *
 * 旧文章「个人数据导出与导入备份」描述的是已下线的 JSON 导入导出，先按原标题改名再按新标题更新正文；
 * 其余条目按标题幂等：已存在则更新正文，不存在才新建，可重复执行。
 * 口径以 apps/server/util/dataExport/ 与 packages/shared/dataExport.js 为准，调整时同步本文件。
 * 用法：node scripts/seedDataBackupKnowledge.js（随「数据与备份」上线执行）
 */
import pool from '../db/index.js';
import { upsertKnowledgeBase } from '../util/services/knowledgeBaseService.js';

const LEGACY_TITLE = '个人数据导出与导入备份：包含什么、不包含什么';
const ARTICLE_TITLE = '数据与备份：一键备份包含什么、保留多久';

const ENTRIES = [
  {
    title: ARTICLE_TITLE,
    category: '帮助中心',
    helpSection: '账号与设置',
    status: 'public',
    type: 'markdown',
    content: `# 数据与备份

在 **设置 → 数据与备份** 里可以一键备份你在轻笺的全部资料，生成一个 ZIP 下载到本地。

## 一键备份包含什么

- **笔记**：保留原始格式（富文本为 HTML，Markdown 笔记为 Markdown），绘画保留可编辑源文件，并下载正文里的图片；无法下载的图片保留原链接，并在导出说明里列出。
- **书签**：一个 Excel，包含标题、网址、描述和已保存的网页正文。
- **文件**：云空间里的原始文件，按目录存放。
- 只包含你自己未删除的内容。资料提取表可以在「自定义内容」里勾选。

## 怎么用

1. 点「备份全部资料」。关闭页面也会继续，完成后会收到站内通知。
2. 回到「数据与备份」点「下载备份」，App 里会交给系统下载。
3. 只想备份一部分，或想把笔记统一导出为 HTML 或 Markdown，点「自定义内容」。

## 保留多久

- 备份文件生成后保留 24 小时，过期自动清理，可以随时重新备份。
- 页面会显示上次备份的时间；资料有较多变化时，建议再备份一次。
- 文件较多时，打包和下载需要更长时间。

## 文件很多时

文件总量超出服务器一次能打包的大小时，一键备份只包含笔记和书签，页面会给出提示；文件可以在云空间里选中后批量下载。

## 部分完成或失败

- 个别资料没能完整导出时显示「部分完成」，ZIP 里附有导出说明，页面上可以「查看未完成项目」。
- 因服务器暂存空间不足等原因失败时，可以直接重试。

## 能导回轻笺吗

备份目前不能一键导回轻笺。笔记可以通过「笔记导入」重新导入 Markdown、HTML 文件，书签和文件可以按各自页面的导入、上传功能重新添加。

## 我们的承诺

- **内容归你**：你保留对自己内容的权利。轻笺只在存储、同步、检索和你主动使用的 AI 功能所需范围内处理它们，不公开、不转让。
- **随时完整带走**：笔记、书签和文件都导出为通用格式，换到其他工具也能打开。
- **停运提前告知**：如果长期停止运营，至少提前 30 天通知，并在此期间保留完整导出。完整条款见用户协议第 9 条。`,
  },
  {
    title: '如何备份数据',
    category: 'FAQ',
    status: 'public',
    type: 'markdown',
    content: `### 如何备份数据？

打开 **设置 → 数据与备份**，点「备份全部资料」，笔记、书签和文件原件会打包成一个 ZIP；完成后会收到通知，24 小时内可以下载。只想备份一部分时点「自定义内容」。

书签页的导入导出、笔记的单篇导出仍然可以单独使用。`,
  },
];

async function main() {
  const [[root]] = await pool.query(
    "SELECT id FROM user WHERE role = 'root' AND del_flag = 0 ORDER BY create_time LIMIT 1",
  );
  if (!root?.id) throw new Error('未找到 root 用户，无法写入知识库');

  const [renamed] = await pool.query(
    `UPDATE knowledge_base SET title = ?
      WHERE title = ? AND COALESCE(admin_archived, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM knowledge_base WHERE title = ?) AS taken)`,
    [ARTICLE_TITLE, LEGACY_TITLE, ARTICLE_TITLE],
  );
  if (renamed.affectedRows) console.log(`[knowledge] renamed → ${ARTICLE_TITLE}`);

  for (const entry of ENTRIES) {
    const result = await upsertKnowledgeBase({ userId: root.id, input: entry });
    console.log(`[knowledge] ${result.action} → ${result.title}`);
  }
  console.log(`[knowledge] 完成，共 ${ENTRIES.length} 条`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[knowledge] 写入失败:', error?.message || error);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  });
