-- 2026-07-17 轻笺全局快捷键帮助文档（MySQL 5.7 兼容）
-- 这是线上业务数据写入脚本，不随结构迁移或部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @shortcut_id = '20969526-f304-41e8-a19d-a57ef9c1b68e';
SET @shortcut_title = '轻笺全局快捷键：快速搜索与打开 AI 助手';
SET @shortcut_content = '<h2>全局快捷键</h2><p>电脑端可以使用两组全局快捷键：按 <code>/</code> 快速聚焦全局搜索；在 macOS 按 <code>⌘ + /</code>、在 Windows 或 Linux 按 <code>Ctrl + /</code>，可以从任意页面打开轻笺智域并聚焦输入框。</p><p>AI 助手已经打开时，再按一次 AI 快捷键只会重新聚焦输入框，不会关闭对话；按 <code>Esc</code> 可以关闭助手。单独的 <code>/</code> 在输入框或可编辑内容中不会抢占正常输入。</p><p>可以前往“设置 → 全局快捷键”查看当前设备对应的按键提示。快捷键仅在电脑端启用。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @shortcut_id, @shortcut_title, @shortcut_content,
  '帮助中心', 'public', 'html', 98, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @shortcut_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @shortcut_id);

UPDATE knowledge_base
SET content = @shortcut_content, category = '帮助中心', status = 'public', type = 'html', sort = 98, updated_by = NULL
WHERE id = @shortcut_id OR title = @shortcut_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id = @shortcut_id OR title = @shortcut_title;
