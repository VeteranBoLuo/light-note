/**
 * 同步「笔记内上传文件」公开帮助条目。
 *
 * 按标题幂等：已存在则更新正文，不存在才新建，可重复执行。
 * 用法：node scripts/seedNoteFileUploadKnowledge.js
 */
import pool from '../db/index.js';
import { upsertKnowledgeBase } from '../util/services/knowledgeBaseService.js';

const entry = {
  title: '怎么在笔记里上传并引用文件',
  category: '帮助中心',
  status: 'public',
  type: 'markdown',
  content: `# 在笔记里上传文件

富文本和 Markdown 笔记都可以直接把本地文件保存到云空间，并在正文中插入可打开的文件引用。

## 使用方法

1. 打开一篇可编辑的笔记
2. 在编辑器工具栏选择「插入 → 文件」
3. 选择一个本地文件
4. 上传前可以修改文件名并选择云空间文件夹；文件扩展名会保持不变
5. 点击「上传并插入」

上传成功后，正文会显示与「@ 站内资源」相同的文件引用。点击引用可以预览文件或前往云空间查看。

## 同名文件

笔记内上传始终创建新的云文件，不会覆盖已有文件。若目标位置已经存在同名文件，系统会自动添加序号，例如「资料 (1).pdf」。原文件以及其他笔记中的旧引用都不会受影响。

## 上传时继续编辑

系统会记住你开始上传时的光标位置。如果上传期间正文发生变化，为避免插错位置，文件仍会安全保存在云空间，但不会强行写入旧位置。把光标放到需要的位置后，点击「插入到当前光标」即可。

取消或上传失败不会创建云空间文件；如果文件已经保存成功，即使暂时没有插入正文，也可以稍后通过「@ 站内资源」再次选择它。`,
};

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
