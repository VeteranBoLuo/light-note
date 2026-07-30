-- 2026-07-31 下线手工「相关标签」关系表（MySQL 5.7，可重复执行）
--
-- 背景：标签之间的相关性已改为按共同资源(resource_tag_relations)自动推导，
-- 统一由 util/tagRelationScore.js + util/services/tagRelationService.js 计算，
-- 服务于标签详情、单标签图谱与全局知识地图三个入口。
--
-- 前置：应用侧已停止一切 tag_relations 写入与读取；
-- 编辑标签时会顺带清理该标签的历史关系，存量随使用自然收敛。
-- 执行前的存量已导出备份：docs/done/tag_relations-backup-20260731.json（36 行）。
--
-- 注意：accountDeletion.js 通过 tables.has('tag_relations') 做存在性守卫，
-- 表删除后注销流程会自动跳过该步骤，无需同步改代码。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP TABLE IF EXISTS tag_relations;
