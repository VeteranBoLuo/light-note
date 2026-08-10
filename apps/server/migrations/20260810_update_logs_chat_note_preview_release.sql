-- 2026-08-10 公共聊天室、笔记编辑与文件预览：更新日志同步（MySQL 5.7、幂等）
-- 仅同步 update_logs 业务内容，不修改表结构；不随部署脚本自动执行。
-- 依赖：20260728_update_logs_markdown.sql 创建的 update_logs。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

INSERT INTO update_logs
  (id, title, publish_date, summary, highlights, tags, content_markdown, image_keys, status, sort, created_by)
VALUES
  (
    'release-20260810-chat-note-preview',
    '公共聊天室上线：笔记编辑与文件预览同步升级',
    '2026-08-10',
    '轻笺公共聊天室正式上线，笔记编辑器和文件在线预览同步完成一轮体验升级，PC、移动网页与 App 使用更加连贯。',
    JSON_ARRAY(
      '公共聊天室同时适配 PC 与移动端，游客可以浏览，登录后可发送文字和图片，并使用点赞、引用回复、提及、撤回与个人删除。',
      '聊天室支持用户资料卡、等级、称号和动态头像框展示，并提供实时未读角标、四档提醒、屏蔽与举报等设置。',
      '笔记编辑器进一步统一富文本与 Markdown 操作，完善快捷键、查找替换、撤销重做、图文组合、渐变文字和移动端原生选区体验。',
      '笔记保存、格式转换、版本恢复与多页面切换更加可靠，冲突提示和历史还原点可以减少意外覆盖。',
      '文件在线预览新增压缩包目录浏览、旧版 Office 转 PDF，以及更多文本格式支持；图片和 PDF 查看操作也更加统一。',
      'AI 执行确认操作后可以继续结合执行结果回答，减少动作完成后需要重新追问的情况。'
    ),
    JSON_ARRAY('聊天室', '笔记', '文件预览', '移动端', 'AI'),
    '## 公共聊天室正式上线\n\n轻笺新增独立的公共聊天室，PC 与移动端都可以从主导航直接进入。游客可以浏览最近消息，登录后即可参与交流：\n\n- 支持发送纯文本和最多 4 张图片，也支持粘贴或拖入图片。\n- 支持点赞、引用回复和提及；移动端点击消息气泡即可打开操作面板。\n- 普通用户可在发送后 2 分钟内撤回消息，也可以仅从自己的会话记录中删除消息。\n- 点击头像可以查看公开资料、等级、称号和已解锁成就，已佩戴头像框会在消息列表中动态展示。\n- 图片查看器支持连续切换、缩放、拖动、旋转、适应窗口和下载。\n- 聊天室提醒分为仅管理员、仅提及、管理员和提及、全部消息四档，并可随时关闭；普通聊天不会挤进通知中心，只有符合设置的回复或提及才会形成定向通知。\n- 新消息通过实时连接同步，离线或连接异常时会自动使用前台刷新兜底。\n- 提供屏蔽、举报和聊天室治理能力，尽量让公共交流保持友好、克制。\n\n## 笔记编辑体验继续升级\n\n本轮进一步统一了富文本和 Markdown 两种编辑模式：\n\n- 工具栏重新整理高频与低频操作，补齐查找替换、快捷键帮助、撤销重做和“重复上一步”。\n- Markdown 源码编辑、预览、任务列表和 Mermaid 图表操作更加稳定。\n- 富文本新增更可靠的图文组合与渐变文字效果，HTML 与 Markdown 往返时尽量保留受支持的结构。\n- 移动端继续使用系统原生复制、粘贴和全选菜单，编辑工具与正文区域占用更紧凑。\n- 保存、格式转换、版本恢复和 AI 修改都加强了版本校验与还原点，多个页面同时编辑时会明确提示冲突，避免静默覆盖。\n- 页面树、正文大纲、只读预览和连续切换体验得到优化，长笔记浏览更顺畅。\n\n## 文件在线预览扩展\n\n云空间现在可以直接预览更多文件：\n\n- ZIP、RAR、7Z、TAR 等压缩包可安全浏览目录、搜索文件并分页查看。\n- DOC、XLS、PPT、RTF、ODT、ODS、ODP 等旧版 Office 文件会在后台转换为 PDF 后预览。\n- TSV、JSONL、SRT、VTT、ICS、VCF、DIFF、PATCH 等格式可直接按文本查看。\n- 图片与 PDF 查看器统一了缩放、旋转、适应窗口、切换和下载操作，并改善了移动端安全区与工具栏遮挡问题。\n\n## 其他体验改进\n\n移动端弹窗、抽屉和系统返回的切换更加稳定；动态头像框在保留展示效果的同时降低了消息滚动负担。AI 在确认并成功执行操作后，也会继续结合真实执行结果完成回答，不再停在一张确认卡上。',
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
WHERE id = 'release-20260810-chat-note-preview';
