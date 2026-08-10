/**
 * 同步「富文本图文组合」公开帮助条目。
 *
 * 按标题幂等：已存在则更新正文，不存在才新建，可重复执行。
 * 用法：node scripts/seedRichMediaTextKnowledge.js
 */
import pool from '../db/index.js';
import { upsertKnowledgeBase } from '../util/services/knowledgeBaseService.js';

const entry = {
  title: '富文本笔记怎么让图片和文字一一对应',
  category: '帮助中心',
  status: 'public',
  type: 'markdown',
  content: `# 富文本图文组合

需要让每张图片固定对应一段文字时，请使用富文本编辑器的「更多格式 → 图文组合」，不要用普通图片的左对齐来模拟。

## 插入方法

1. 打开一篇富文本笔记
2. 在工具栏选择「更多格式 → 图文组合」
3. 选择第一张图片，然后在图片旁边输入这张图片对应的说明
4. 点击这一组图文，可以继续选择「添加一组」

每一组始终只包含一张图片和一段说明，所以电脑端变宽后，文字不会跑到另一张图片旁边。

## 可调整内容

- 图片在左或图片在右
- 图片宽度 30%、36% 或 42%
- 替换当前图片
- 添加一组或删除当前组

电脑端会限制图片列的最大宽度，手机端按所选比例保持图文并排。普通图片仍可独立插入和调整大小，不会被自动改成图文组合。

## 格式切换与导出

图文组合属于富文本的受控结构。切换到 Markdown 时会保留为一段 HTML，之后切回富文本仍能恢复一图一文；导出离线 HTML 时也会保留相同布局。`,
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
