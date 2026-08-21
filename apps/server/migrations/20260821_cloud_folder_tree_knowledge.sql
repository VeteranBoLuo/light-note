-- 2026-08-21 云空间多级文件夹帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 帮助内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @cloud_folder_help_id = '2c1f4a5e-a0c3-4b18-a1d2-8f5e0d7c9b21';
SET @cloud_folder_help_title = '云空间文件夹：新建子级、移动与整理文件';
SET @cloud_folder_help_content = '<h1>云空间文件夹</h1><p>云空间使用文件夹目录树整理文件。页面不会额外显示“根目录”节点：固定的“全部文件”用于查看当前账号的所有文件，下面直接展示第一层文件夹。</p><h2>新建文件夹和子文件夹</h2><p>点击目录底部的“新建文件夹”会创建第一层文件夹。电脑端可以悬停或右键某个文件夹，再选择“新建子文件夹”；移动端从页面操作进入“文件夹管理”，打开目标文件夹的更多操作后新建子级。目录最多支持 8 层。</p><h2>移动与排序文件夹</h2><p>电脑端可把文件夹拖到目标项上方、下方或中间，分别调整前后顺序或移入为子文件夹；拖到“全部文件”可变为第一层文件夹。文件夹操作中的“移动文件夹”也可完成跨层移动。系统会阻止把文件夹移到自身或自己的后代中，也会阻止移动后超过最大层级。</p><h2>移动文件与不放入文件夹</h2><p>移动单个或多个文件时，可以选择目录树中的任意文件夹，也可以选择“不放入文件夹”。未放入文件夹的文件仍会出现在“全部文件”中，但不会出现在任何具体文件夹内。</p><h2>删除文件夹</h2><p>文件夹包含文件或子文件夹时也可以删除，但系统会先给出明确确认。确认后会删除整棵文件夹目录，目录内文件不会被删除，而是改为不放入文件夹并继续显示在“全部文件”中。</p><h2>删除目录内全部文件</h2><p>文件夹菜单中的“删除目录内全部文件”会把当前文件夹及所有子文件夹中的文件批量移入回收站。确认时可以选择是否连同整棵文件夹目录一起删除；不删除目录时，之后从回收站恢复的文件会回到原文件夹。</p><h2>和书签分类的区别</h2><p>云空间的文件夹表达文件位置，同一个文件同一时间只属于一个文件夹；书签继续使用标签分类，一个书签可以关联多个标签，书签不会因为云空间支持子文件夹而变成目录树。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @cloud_folder_help_id, @cloud_folder_help_title, @cloud_folder_help_content,
  '帮助中心', 'public', 'html', 100, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @cloud_folder_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @cloud_folder_help_id);

SET @cloud_folder_help_target_id = COALESCE(
  (SELECT id FROM knowledge_base WHERE id = @cloud_folder_help_id LIMIT 1),
  (SELECT id FROM knowledge_base WHERE title = @cloud_folder_help_title ORDER BY id ASC LIMIT 1)
);

UPDATE knowledge_base
SET title = @cloud_folder_help_title,
    content = @cloud_folder_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 100,
    updated_by = NULL
WHERE id = @cloud_folder_help_target_id;

-- 修正已有帮助中的旧“根目录”叫法，避免与无可见根节点的新目录树冲突。
UPDATE knowledge_base
SET content = REPLACE(
      REPLACE(
        REPLACE(COALESCE(content, ''), '根目录的待整理清单', '未放入文件夹的待整理清单'),
        '根目录文件',
        '未放入文件夹的文件'
      ),
      '云空间根目录',
      '未放入文件夹的位置'
    ),
    updated_by = NULL
WHERE title = '为什么新账号里已经有书签、笔记、标签和文件';

UPDATE knowledge_base
SET content = REPLACE(
      REPLACE(COALESCE(content, ''), '改存云空间根目录', '选择不放入文件夹'),
      '云空间根目录',
      '不放入文件夹（仍可在“全部文件”中查看）'
    ),
    updated_by = NULL
WHERE title = '轻笺智域：上传文件进行摘要、问答和生成笔记';

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @cloud_folder_help_target_id;

-- 执行后通过统一知识库写服务使缓存失效，或等待最多 5 分钟安全 TTL。
