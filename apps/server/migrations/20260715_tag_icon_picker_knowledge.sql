-- 2026-07-15 标签智能选图帮助文档（MySQL 5.7 兼容）
-- 这是线上数据写入脚本，不随结构迁移或 deploy.sh 自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @tag_icon_id = 'd84c6c8f-7e4e-11f1-9a3d-0242ac120002';
SET @tag_icon_title = '标签图标：智能选图、搜索与上传';
SET @tag_icon_content = '<h2>为标签设置图标</h2><p>新增或编辑标签时，点击“智能选图”即可根据标签名称搜索匹配图标。搜索支持中文和英文：中文会自动转换成适合图标库检索的英文关键词，英文会直接搜索。</p><p>在候选列表中点击图标即可选中并返回标签编辑页，最后保存标签后生效。你也可以上传自己的图片，或在“更多方式”中粘贴 SVG、Base64 和图片地址。</p><p>如果没有找到合适图标，可以更换为更简短、具体的关键词继续搜索，也可以点击“前往 Iconify 查看更多”。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @tag_icon_id, @tag_icon_title, @tag_icon_content,
  '帮助中心', 'public', 'html', 95, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE title = @tag_icon_title
);

UPDATE knowledge_base
SET content = @tag_icon_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 95,
    updated_by = NULL
WHERE title = @tag_icon_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE title = @tag_icon_title;
