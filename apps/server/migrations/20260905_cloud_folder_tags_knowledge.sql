-- 文件夹批量标签帮助，幂等、仅知识内容；不随 Schema 检查自动执行。
-- 执行前须有目标环境的知识写入授权。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @folder_tags_help_id = 'b06ae953-169d-4c52-aaca-e0aa1399c467';
SET @folder_tags_help_title = '如何为文件夹里的文件批量添加或移除标签';
SET @folder_tags_help_content = '在云空间打开文件夹的操作菜单，选择“批量管理标签”。电脑端可悬停或右键文件夹；手机端从页面操作进入“文件夹管理”，再打开对应文件夹的更多操作。

## 选择文件范围
默认只处理直接放在当前文件夹中的文件。勾选“包含子文件夹中的文件”后，会同时包含全部子文件夹。此范围不受当前文件类型、搜索或已加载页数影响。点击“选择标签”后会重新核对文件范围，再进入标签工作区。空目录会提示调整范围，超出单次上限时请按子文件夹分次处理。

## 选择标签与预览
添加和移除共用一个页面。可以搜索标签、勾选当前搜索结果或逐项选择；搜索会保留已选标签，“清空选择”会清除本次标签草稿。切换添加和移除时会清空草稿，避免把上一种操作的标签误用于另一种操作。

添加时自动跳过资源已有的标签，全部资源都已经拥有的标签不可重复选择。移除时只展示这些资源当前拥有的标签。页面底部的预览统计实际需要新增或移除的标签关联。

## 确认与返回
确认前核对资源清单和标签预览。添加不会覆盖其他已有标签，移除也只作用于勾选的标签。确认成功后返回来源页面并刷新文件标签；原有批量选择会保留。取消不会写入标签，失败时可以重试。刷新标签工作区会使本次交接失效，请返回来源页面重新进入。

资源中心的批量操作栏和资源详情、笔记库的批量菜单都通过“管理标签”进入相同的标签工作区，在页面内切换添加或移除。';
INSERT INTO knowledge_base (id, title, content, category, help_section, status, type, sort, created_by, updated_by)
SELECT @folder_tags_help_id, @folder_tags_help_title, @folder_tags_help_content,
       '帮助中心', '云空间', 'public', 'markdown', 101, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @folder_tags_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE category = '帮助中心' AND title = @folder_tags_help_title);
UPDATE knowledge_base
SET content = @folder_tags_help_content, help_section = '云空间', status = 'public', type = 'markdown',
    admin_archived = 0, updated_by = NULL
WHERE id = @folder_tags_help_id OR (category = '帮助中心' AND title = @folder_tags_help_title);
COMMIT;
