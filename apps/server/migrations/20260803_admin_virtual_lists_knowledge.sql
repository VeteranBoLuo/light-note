-- 后台虚拟列表内部运维说明（MySQL 5.7 兼容、可重复执行）。
-- 这是 knowledge_base 数据写入脚本，不随结构迁移自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE knowledge_base
SET content = CONCAT(
  content,
  '<h2>后台长列表</h2><p>用户管理、API 日志、操作日志和 AI 调用监控不再使用页码分页，而是滚动到底后继续加载。页面只渲染可视区域附近的记录，服务端仍按批次返回数据，不会一次拉取全部日志。</p><p>搜索、隐藏内部账号或切换排序后，列表会回到顶部并从新的稳定游标重新加载。用户管理的“最近活跃”由服务端按账号持久活跃时间进行全量排序，不是只调整当前已加载记录。</p>'
)
WHERE title = '管理员只读预览与内容代管'
  AND LOCATE('<h2>后台长列表</h2>', content) = 0;

SELECT id, title, status
FROM knowledge_base
WHERE title = '管理员只读预览与内容代管';
