-- 2026-08-08 笔记编辑、模板管理、成长体系与支持入口：更新日志同步（MySQL 5.7、幂等）
-- 仅同步 update_logs 业务内容，不修改表结构；不随部署脚本自动执行。
-- 依赖：20260728_update_logs_markdown.sql 创建的 update_logs。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

INSERT INTO update_logs
  (id, title, publish_date, summary, highlights, tags, content_markdown, image_keys, status, sort, created_by)
VALUES
  (
    'release-20260808-note-growth-support',
    '笔记编辑体验升级：模板管理、成长体系与支持入口',
    '2026-08-08',
    '笔记编辑器和模板工作流完成重构，“我的成长”新增永久 AI 奖励余额与更多头像框，同时上线自愿支持轻笺入口。',
    JSON_ARRAY(
      'Markdown 与富文本编辑器统一了紧凑工具栏、搜索、快捷键和滚动体验，图表编辑及移动端图片尺寸调整也更加顺手。',
      '自定义笔记模板现在可以统一创建、预览、编辑、复制、使用和删除，并提供独立的模板管理入口。',
      '“我的成长”页面重构任务、成就、积分与奖励展示，成长获得的 AI 奖励改为永久余额，不再按日失效。',
      '头像框奖励扩展到 12 个成长档位，解锁路径和佩戴状态更清晰。',
      '新增“支持轻笺”入口；核心功能继续免费，支持完全自愿，不与功能权益绑定。'
    ),
    JSON_ARRAY('笔记', '模板', '成长', 'AI', '支持轻笺'),
    '## 笔记编辑器重构\n\nMarkdown 与富文本编辑器现在拥有更一致、更紧凑的操作体验：\n\n- 常用格式集中在主工具栏，低频能力收纳到“插入”和“更多格式”。\n- 完善查找与替换、撤销重做，以及 macOS、Windows 常用快捷键。\n- Markdown 编辑与预览布局更清爽，选择、链接、代码块和滚动体验得到优化。\n- Mermaid 图表优先展示渲染结果，可直接进入编辑；删除、撤销和恢复不再反复闪现源码块。\n- 移动端保留系统原生文字选择菜单，并可在图片设置抽屉中连续尝试不同尺寸。\n- 富文本内容保存前经过安全清洗，保留常用排版并阻止脚本、危险链接和主动嵌入内容。\n\n## 自定义模板统一管理\n\n新增独立的模板管理工作区，可以搜索和筛选自己的模板，并完成创建、预览、编辑、复制、使用和删除。模板正文直接复用笔记编辑能力，编辑区域固定在工作区内独立滚动；保存时带版本校验，避免多个页面同时修改时静默覆盖。新建笔记弹窗中的“我的模板”标题旁也提供了更直接的管理入口。\n\n## 我的成长升级\n\n“我的成长”重新组织了等级进度、每日任务、成就、积分记录和奖励入口。通过成长任务获得的 AI 奖励进入永久余额，可跨天保留，并在使用 AI 时优先衔接现有额度。头像框奖励扩展为 12 个成长档位，解锁条件、已拥有状态与当前佩戴状态更加清晰。\n\n## 支持轻笺\n\n新增“支持轻笺”页面和爱发电入口，方便愿意的用户自愿支持项目持续维护。轻笺的核心功能继续免费，支持行为不会解锁额外功能，也不会影响现有使用权益。',
    JSON_ARRAY(),
    'published',
    0,
    NULL
  )
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  publish_date = VALUES(publish_date),
  summary = VALUES(summary),
  highlights = VALUES(highlights),
  tags = VALUES(tags),
  content_markdown = VALUES(content_markdown),
  image_keys = VALUES(image_keys),
  status = VALUES(status),
  sort = VALUES(sort);

COMMIT;

SELECT id, title, publish_date, status, JSON_LENGTH(highlights) AS highlight_count
FROM update_logs
WHERE id = 'release-20260808-note-growth-support';
