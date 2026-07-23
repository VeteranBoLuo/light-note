-- 2026-07-23 新账号示例内容 FAQ（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @new_user_samples_id = '8f1795d6-2991-40f1-835e-fae25eb1c3d9';
SET @new_user_samples_title = '为什么新账号里已经有书签、笔记、标签和文件';
SET @new_user_samples_content = '<h1>新账号示例内容</h1><p>通过邮箱注册或首次使用 GitHub 创建账号后，轻笺会准备少量示例内容，帮助你直接了解书签、笔记、标签和云空间如何配合使用，而不必从完全空白的页面开始。</p><h2>会准备什么</h2><ul><li>4 个带图标且可以继续使用的基础标签；</li><li>3 个介绍轻笺帮助、共建入口和开源项目的书签；</li><li>2 篇分别展示富文本与 Markdown 的入门笔记；</li><li>1 个示例文件夹，以及 2 份可正常预览、下载和重命名的 Markdown 文件：使用说明位于示例文件夹，待整理清单位于云空间根目录。</li></ul><h2>为什么“全部文件”和示例文件夹内容不同</h2><p>“全部文件”会显示两份示例文件；打开“轻笺示例”文件夹时只显示其中的使用说明，根目录的待整理清单不会显示在该文件夹中。这样可以直接体验文件夹筛选和根目录文件的区别。</p><h2>可以修改或删除吗</h2><p>可以。这些内容属于你自己的账号，与自己创建的普通内容拥有相同的编辑、整理和删除能力。删除后不会自动恢复，也不会在以后登录时重新生成。</p><h2>哪些账号会收到</h2><p>只在新账号首次创建时初始化。已有账号登录、把 GitHub 绑定到已有邮箱账号，以及功能上线前已经注册的历史账号都不会被自动补发，避免打扰已有内容。</p><h2>如果示例文件暂时没有出现</h2><p>云空间示例文件需要先完成真实文件上传；网络或对象存储暂时不可用时不会阻断注册，也不会显示无法打开的假文件。其他示例内容和账号登录仍可正常使用。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @new_user_samples_id, @new_user_samples_title, @new_user_samples_content,
  'FAQ', 'public', 'html', 104, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @new_user_samples_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @new_user_samples_id);

UPDATE knowledge_base
SET content = @new_user_samples_content,
    category = 'FAQ',
    status = 'public',
    type = 'html',
    sort = 104,
    updated_by = NULL
WHERE id = @new_user_samples_id OR title = @new_user_samples_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @new_user_samples_id OR title = @new_user_samples_title;
