-- 2026-08-08 后台用户私有备注内部说明（MySQL 5.7 兼容、幂等）。
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @admin_user_remark_help_id = '6990f421-1184-4661-a7d1-58c3a4e74976';
SET @admin_user_remark_help_title = '后台用户管理：私有备注名';
SET @admin_user_remark_help_content = '<h2>给用户设置私有备注名</h2><p>Root 可以在「后台管理 → 用户管理」的用户操作菜单中选择「设置备注」，为用户保存一个便于自己识别的备注名。备注会显示在用户列表和用户详情中，也可以通过用户管理搜索框检索。</p><h2>可见范围</h2><p>备注按“当前 Root 管理员 + 目标用户”独立保存，只会返回给设置它的 Root。普通用户在个人资料、公开页面和普通业务接口中都看不到；如果未来存在其他 Root，其用户列表也不会读取你的备注。</p><h2>修改与清除</h2><p>再次打开「设置备注」可以修改；清空输入框后保存会删除该备注，不会修改用户自己的昵称、邮箱或其他资料。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @admin_user_remark_help_id, @admin_user_remark_help_title, @admin_user_remark_help_content,
  '内部知识', 'internal', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @admin_user_remark_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @admin_user_remark_help_id);

UPDATE knowledge_base
SET content = @admin_user_remark_help_content,
    category = '内部知识',
    status = 'internal',
    type = 'html',
    sort = 96,
    updated_by = NULL
WHERE id = @admin_user_remark_help_id OR title = @admin_user_remark_help_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id = @admin_user_remark_help_id OR title = @admin_user_remark_help_title;
