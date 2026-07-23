-- 2026-07-23 发布更新日志（MySQL 5.7 兼容、幂等）
-- 将本次已上线的核心能力追加到“更新日志”配置；重复执行不会重复追加。
-- 不覆盖既有历史记录；若历史 JSON 异常则保持原值，交由发布前检查发现并处理。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @changelog_name = '更新日志';
SET @release_label = '✨ 「轻笺智域」AI 工作区上线 · 智能创作、文件解析、共建反馈与知识足迹全面升级';
SET @release_time = '2026-07-23';

SET @release_entry = JSON_OBJECT(
  'label', @release_label,
  'time', @release_time,
  'list', JSON_ARRAY(
    '「轻笺智域」升级为完整的 AI 对话工作区：支持云端会话历史、自动标题、切换、搜索、重命名与删除；桌面端可在抽屉和全屏间切换，并记住常用的窗口尺寸与打开方式。跨设备清空云端记录后，也可选择以新会话继续或把本地历史恢复到新的云端会话。',
    'AI 对话支持更丰富的上下文：可通过「@添加资源」选择书签、笔记、文件等资料，也可直接上传文件；回答会展示引用来源，支持跳回对应资源或帮助中心内容继续阅读。',
    'AI 助手新增上下文相关的快捷追问、流式回答优化与重新生成能力；长回答的滚动、断线恢复、终态提示和移动端输入体验同步加强，使用过程更连贯。对于新建笔记、书签、标签、待办及内容修改等操作，会先展示清晰预览并等待确认。',
    '文件与知识处理能力增强：AI 可解析上传的文档和图片，支持本地 OCR、文档内容检索、文件状态与覆盖提示；临时附件可保存到云空间，解析与清理失败也具备更可靠的重试机制。',
    '笔记创作体验持续升级：新增内置与个人笔记模板、笔记置顶与批量操作；笔记内 AI 建议支持原文与生成结果对比、放大预览、追问迭代与撤回应用。现在还可在正文输入「@」提及自己的书签、笔记或文件，保存为可跳转的资源引用，并在资源详情查看哪些笔记正在引用它。',
    '书签整理更稳妥：新增网址识别与信息覆盖确认，可取消或修正自动识别结果；网页快照和图片 OCR 的成功率、超时控制与失败重试均有提升，保存后的网站图标也会自动刷新。',
    '全新推出「共建轻笺」：用户可以提交功能建议、投票支持想法、查看开发进度与回复；产品改进不再只是单向发布，而是可以持续收集、展示和跟进反馈。',
    '新增「知识足迹」热力图：以 GitHub 风格按自然年展示书签、笔记、文件创建与签到活动；悬停查看当天总活动，点击可展开各类型明细，移动端也能横向浏览全年。',
    '账号与稳定性同步加强：邮箱会自动去除首尾空格并受唯一约束保护，登录设备按浏览器聚合管理；验证码接口增加频率限制，日志脱敏、异常保护、资源查询与后台任务稳定性也进一步优化。',
    '出于隐私与可控性考虑，AI 长期记忆目前暂时关闭：普通对话不会自动读取或生成长期记忆，后续会以更完整、可控的方案重新提供。'
  )
);

INSERT INTO config_json (name, json_content, del_flag)
VALUES (@changelog_name, JSON_ARRAY(JSON_EXTRACT(@release_entry, '$')), 0)
ON DUPLICATE KEY UPDATE
  json_content = IF(
    JSON_VALID(json_content) = 1
      AND JSON_SEARCH(json_content, 'one', @release_label) IS NULL,
    JSON_ARRAY_APPEND(json_content, '$', JSON_EXTRACT(@release_entry, '$')),
    json_content
  ),
  del_flag = 0;

COMMIT;

SELECT
  name,
  JSON_VALID(json_content) AS json_valid,
  JSON_LENGTH(json_content) AS entry_count,
  updated_time
FROM config_json
WHERE name = CONVERT(@changelog_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND del_flag = 0;
