/**
 * 同步「笔记编辑器快捷键」公开帮助条目。
 *
 * 按标题幂等：已存在则更新正文，不存在才新建，可重复执行。
 * 用法：node scripts/seedNoteEditorShortcutKnowledge.js
 */
import pool from '../db/index.js';
import { upsertKnowledgeBase } from '../util/services/knowledgeBaseService.js';

const entry = {
  title: '笔记编辑器有哪些快捷键，怎么撤销和重做',
  category: '帮助中心',
  status: 'public',
  type: 'markdown',
  content: `# 笔记编辑器快捷键

打开笔记后，可以点击格式工具栏中的键盘图标查看当前编辑模式支持的快捷键。电脑端会直接显示这个入口；移动端可以在「更多」操作面板中找到。

## 常用操作

- 保存：Ctrl/⌘ + S（笔记编辑页）
- 撤销：Ctrl/⌘ + Z
- 重做：Ctrl/⌘ + Shift + Z，也可以在 Windows / Linux 使用 Ctrl + Y
- 重复上一步：F4，也可以使用 Ctrl/⌘ + Alt + R
- 查找与替换：Ctrl/⌘ + F

“重做”和“重复上一步”是两个不同功能：重做只恢复刚刚被撤销的内容；重复上一步会再次使用最近一次格式功能。例如先给一段文字加粗或设置渐变，再选中另一段文字，执行“重复上一步”即可套用相同功能。完成一次可重复的格式操作后，重复按钮才会变为可用。

## 文字格式

富文本与 Markdown 都支持粗体 Ctrl/⌘ + B、斜体 Ctrl/⌘ + I、下划线 Ctrl/⌘ + U 和链接 Ctrl/⌘ + K。Markdown 的下划线会保存为兼容的 \`<u>文字</u>\`，在轻笺预览、格式转换和导出中保留。

Markdown 另外支持删除线、行内代码、有序列表、无序列表和一至六级标题。“重复上一步”会分别记住富文本与 Markdown 当前模式最近一次可重复操作，请以快捷键弹窗中当前模式显示的列表为准。`,
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
