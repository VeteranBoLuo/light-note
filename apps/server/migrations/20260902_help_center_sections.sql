-- 帮助中心栏目元数据。
-- category 继续作为“公开帮助”安全边界；help_section 只负责帮助中心内的展示分组。
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，使用 information_schema 保持幂等。

SET @help_section_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema=DATABASE()
    AND table_name='knowledge_base'
    AND column_name='help_section'
);

SET @help_section_ddl := IF(
  @help_section_column_exists = 0,
  "ALTER TABLE `knowledge_base` ADD COLUMN `help_section` varchar(50) DEFAULT NULL COMMENT '帮助中心展示栏目；仅 category=帮助中心 时使用' AFTER `category`",
  'SELECT 1'
);
PREPARE help_section_statement FROM @help_section_ddl;
EXECUTE help_section_statement;
DEALLOCATE PREPARE help_section_statement;

-- 仅为历史帮助文章生成一次初始栏目。运行时不再根据标题猜测分类；后续由知识库编辑器维护。
UPDATE knowledge_base
SET help_section = CASE
  WHEN title REGEXP 'AI|智能|额度|权益|笔记助手|轻笺助手' THEN 'AI 与权益'
  WHEN title REGEXP '待办|任务|提醒|日历|待处理' THEN '待办与提醒'
  WHEN title REGEXP '云空间|云文件|文件夹|文件预览|文件分享|上传方式|存储空间|扩容' THEN '云空间'
  WHEN title REGEXP '笔记|Markdown|富文本|模板' THEN '笔记与编辑'
  WHEN title REGEXP '书签|标签|资源中心|整理|链接|网页|搜索|导入导出|收藏' THEN '收集与整理'
  WHEN title REGEXP '账号|账户|登录|注册|个人中心|成长|积分|设置|安全|隐私|回收站|数据恢复|备份' THEN '账号与设置'
  WHEN title REGEXP '共建|反馈|支持轻笺|聊天室|开源|官网|帮助中心地址' THEN '社区与支持'
  WHEN title REGEXP '快速|开始|入门|欢迎|总览|完整介绍|使用指南|功能路径|快捷键|安装|移动端' THEN '快速上手'
  ELSE '其他帮助'
END
WHERE category='帮助中心'
  AND (help_section IS NULL OR TRIM(help_section)='');

SELECT help_section, COUNT(*) AS article_count
FROM knowledge_base
WHERE category='帮助中心' AND status='public'
GROUP BY help_section
ORDER BY MIN(sort), help_section;
