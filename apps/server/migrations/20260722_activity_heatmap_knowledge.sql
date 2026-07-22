-- 2026-07-22 知识足迹（活动热力图）帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @activity_heatmap_id = 'cd7dbec4-6220-48f3-b2cf-148bde7f9e4c';
SET @activity_heatmap_title = '知识足迹（活动热力图）：统计范围与查看方式';
SET @activity_heatmap_content = '<h1>知识足迹（活动热力图）</h1><p>“我的成长”页面中的“知识足迹”会按自然年把你的真实知识活动显示为热力图：颜色越深，代表当天记录的活动越多。它用于回看沉淀与坚持，不会把浏览页面、搜索或普通点击包装成活动。</p><h2>会统计哪些活动</h2><ul><li>新建书签；</li><li>新建笔记；</li><li>上传或新建云空间文件；</li><li>每日签到，包含使用补签卡补上的签到。</li></ul><p>同一天完成多项操作会累计次数。例如当天新建 1 个书签、2 篇笔记并签到，格子会显示 4 次活动。资源后来移入回收站后，已发生的创建日仍会保留足迹。</p><h2>哪些不会计入</h2><p>打开资源、搜索、编辑已有内容、调整标签或排序、领取奖励、抽奖，以及成长系统为资源创建派生出的额外经验或积分，都不会额外增加格子。这样一次真实创建不会被成长奖励重复放大。</p><h2>如何查看明细</h2><p>电脑端把鼠标移到格子上，只会看到当天的总活动次数；点击格子后，热力图下方会展开书签、笔记、文件和签到各自的次数。移动端直接点按格子即可查看相同明细。当前年份会自动定位到今天附近；如果你有历史活动，可通过年份选择器查看对应自然年。</p><h2>统计边界</h2><p>热力图按服务器本地日期统计，每个自然年独立计算“活跃天数”和“最长连续”。新账号和游客不会预填虚假的活动记录；没有活动时会显示空态提示。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @activity_heatmap_id, @activity_heatmap_title, @activity_heatmap_content,
  '帮助中心', 'public', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @activity_heatmap_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @activity_heatmap_id);

UPDATE knowledge_base
SET content = @activity_heatmap_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    updated_by = NULL
WHERE id = @activity_heatmap_id OR title = @activity_heatmap_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @activity_heatmap_id OR title = @activity_heatmap_title;
