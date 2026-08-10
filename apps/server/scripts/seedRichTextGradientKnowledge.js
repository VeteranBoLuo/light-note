/**
 * 同步「富文本渐变文字」公开帮助条目。
 *
 * 按标题幂等：已存在则更新正文，不存在才新建，可重复执行。
 * 用法：node scripts/seedRichTextGradientKnowledge.js
 */
import pool from '../db/index.js';
import { upsertKnowledgeBase } from '../util/services/knowledgeBaseService.js';

const entry = {
  title: '富文本笔记怎么添加和修改渐变文字',
  category: '帮助中心',
  status: 'public',
  type: 'markdown',
  content: `# 富文本渐变文字

轻笺的富文本笔记支持给选中的文字设置自定义渐变色。

## 添加方法

1. 打开一篇富文本笔记并选中需要设置的文字
2. 在工具栏选择「更多格式 → 渐变文字」
3. 输入起始颜色和结束颜色，颜色使用十六进制格式，例如 #615CED
4. 选择从左到右、斜向、从上到下等渐变方向
5. 查看预览后点击「应用渐变」

## 修改或移除

把光标放进已有渐变文字，再打开「更多格式 → 渐变文字」，可以重新调整颜色和方向，也可以选择「移除渐变」。

## 保存、切换格式与导出

渐变文字使用轻笺的受控样式保存，不会运行用户输入的任意 CSS。保存后重新打开、切换到 Markdown 再切回富文本，以及导出离线 HTML 时，都会保留渐变配置。系统开启“减少动态效果”时，示例里的呼吸、旋转和漂浮动画会停止，但文字与内容仍保持可见。`,
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
