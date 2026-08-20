-- 2026-08-20 待办详情预览与关联资料帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构，也不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @todo_preview_help_id = '5fa7cc32-fa07-4e50-9918-ab4ac59dbe6a';
SET @todo_preview_help_title = '查看和编辑待办：详情预览、清单与关联资料';
SET @todo_preview_help_content = '<h1>点击待办先查看详情</h1><p>在待办列表、议程、日历、四象限或任务系列明细中点击一条待办，默认打开详情预览，不会直接进入编辑表单。详情会集中展示状态、优先级、说明、待办清单、开始与截止时间、任务计划、提醒方式、下一次提醒、关联资料以及创建和更新时间。桌面端也可以点击详情抽屉外的遮罩关闭预览。</p><h2>什么时候进入编辑</h2><p>需要修改标题、说明、清单内容、优先级、时间、提醒或任务计划时，点击详情右上角的“编辑待办”；列表与四象限的更多菜单也继续提供明确的编辑入口。详情里的清单仍可直接勾选，已完成待办的清单保持只读。</p><h2>四象限中的点击</h2><p>四象限卡片的标题、优先级、日期和空白区域都可以打开详情。勾选框、系列的“今天 / 错过 / 后续”胶囊和更多菜单会执行各自操作，不会同时打开待办详情；系列计数在空间足够时完整展示，只有窄屏空间不足时才会省略。</p><h2>打开关联资料</h2><p>待办关联的书签、笔记和文件会以紧凑胶囊展示。无论是在列表、详情预览还是编辑器内，都可以点击胶囊打开对应资料：书签进入书签详情，笔记按账号设置进入预览或编辑，文件进入云空间预览。资料已删除或当前账号无权访问时会标记为“已不可用”并禁止打开；在编辑器中仍可移除这条失效关联。</p><h2>数据边界</h2><p>打开、编辑、完成或删除待办不会修改它关联的书签、笔记或文件；删除关联也只解除待办与资料之间的关系，不删除资料本身。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @todo_preview_help_id, @todo_preview_help_title, @todo_preview_help_content,
  '帮助中心', 'public', 'html', 923, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_preview_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_preview_help_title);

-- 固定 ID 优先；若旧环境已由标题创建过同一条知识，则只更新那一条，避免 OR 条件误改两行。
SET @todo_preview_help_target_id = COALESCE(
  (SELECT id FROM knowledge_base WHERE id = @todo_preview_help_id LIMIT 1),
  (SELECT id FROM knowledge_base WHERE title = @todo_preview_help_title ORDER BY id ASC LIMIT 1)
);

UPDATE knowledge_base
SET title = @todo_preview_help_title,
    content = @todo_preview_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 923,
    updated_by = NULL
WHERE id = @todo_preview_help_target_id;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @todo_preview_help_target_id;

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。
