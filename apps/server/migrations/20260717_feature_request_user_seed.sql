-- 2026-07-17 共建轻笺首批真实用户建议（MySQL 5.7 兼容）
-- 来源为产品所有者“菠萝”在开发会话中实际提出并已经落地的建议。
-- 使用真实账号与公开昵称，不创建虚构用户、不伪造投票、不回填虚假时间。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @root_user_id = (
  SELECT id
  FROM user
  WHERE role = 'root' AND del_flag = 0
  ORDER BY id
  LIMIT 1
);

CREATE TEMPORARY TABLE IF NOT EXISTS feature_request_user_seed (
  id char(36) NOT NULL,
  created_update_id char(36) NOT NULL,
  release_update_id char(36) NOT NULL,
  title varchar(160) NOT NULL,
  content text NOT NULL,
  category varchar(32) NOT NULL,
  developer_reply text NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELETE FROM feature_request_user_seed;

INSERT INTO feature_request_user_seed
  (id, created_update_id, release_update_id, title, content, category, developer_reply)
VALUES
  (
    '6f7a1001-6178-4d01-9001-202607170001',
    '7f7a1001-6178-4d01-9001-202607170001',
    '8f7a1001-6178-4d01-9001-202607170001',
    '书签搜索输入后立即筛选，不再要求按回车',
    '书签模块的搜索应该在输入关键词后自动触发，并增加适当防抖；这样连续输入时不会频繁请求，也不用额外按一次回车才能看到结果。',
    'bookmark',
    '已上线输入即搜索与防抖处理，清空关键词时也会及时恢复完整书签列表。'
  ),
  (
    '6f7a1002-6178-4d01-9001-202607170002',
    '7f7a1002-6178-4d01-9001-202607170002',
    '8f7a1002-6178-4d01-9001-202607170002',
    '统一书签、笔记和云空间的页面风格与交互',
    '工作台、书签、笔记和云空间应该使用一致的标题、操作区、内容工作区与卡片层级，同时保留各资源自己的语义色，避免页面之间像不同产品。',
    'experience',
    '统一资源页风格已经上线，并继续优化了深浅主题、移动端布局与工作区层次。'
  ),
  (
    '6f7a1003-6178-4d01-9001-202607170003',
    '7f7a1003-6178-4d01-9001-202607170003',
    '8f7a1003-6178-4d01-9001-202607170003',
    '资源模块标题支持点击刷新并回到全部内容',
    '书签、笔记、云空间和工作台的模块标题可以作为轻量刷新入口。点击后应清除当前局部筛选或选中状态，重新展示该模块的全部内容。',
    'experience',
    '标题刷新交互已经上线，并移除了标题悬停时不必要的背景框和文字提示。'
  ),
  (
    '6f7a1004-6178-4d01-9001-202607170004',
    '7f7a1004-6178-4d01-9001-202607170004',
    '8f7a1004-6178-4d01-9001-202607170004',
    'AI 文件阅读：上传文档或选择云空间文件',
    '轻笺智域支持直接上传本地文件，也可以从「添加资源」选择已有云空间文件。TXT、Markdown、CSV、带文本层的 PDF 和 DOCX 会异步解析，可用于摘要、问答、提取结论和整理成笔记。',
    'ai',
    '单文件解析闭环已上线，两种文件入口共用解析状态、正文召回和可追溯来源引用。'
  ),
  (
    '6f7a1005-6178-4d01-9001-202607170005',
    '7f7a1005-6178-4d01-9001-202607170005',
    '8f7a1005-6178-4d01-9001-202607170005',
    'Markdown 目录定位到标题顶部',
    'Markdown 笔记点击目录后，目标标题应该像富文本目录一样贴近内容区顶部，只保留约 5～10px 的呼吸空间，不能停在距离顶部很远的位置。',
    'note',
    'Markdown 目录定位已按编辑容器与界面缩放统一换算，目标标题会准确停在顶部留白位置。'
  ),
  (
    '6f7a1006-6178-4d01-9001-202607170006',
    '7f7a1006-6178-4d01-9001-202607170006',
    '8f7a1006-6178-4d01-9001-202607170006',
    '书签 AI 智能整理入口去重',
    '书签模块和书签管理都有整理能力时，不应该重复放置含义相同的入口。保留最容易理解、最接近批量管理场景的位置，减少顶部操作区负担。',
    'bookmark',
    '重复入口已经收敛，书签智能整理继续在管理场景中提供，能力本身没有移除。'
  ),
  (
    '6f7a1007-6178-4d01-9001-202607170007',
    '7f7a1007-6178-4d01-9001-202607170007',
    '8f7a1007-6178-4d01-9001-202607170007',
    '深色主题下网站图标保持清晰与原色',
    '部分网站 favicon 在深色背景上会看不清，但统一加底色、反色或滤镜又会让正常图标整体变暗、颜色失真。希望只解决可见性问题，同时尽量保留网站原始品牌色。',
    'bookmark',
    '网站图标展示已改为透明容器与原图直出，不再统一反色、描边或套用改变颜色的滤镜。'
  ),
  (
    '6f7a1008-6178-4d01-9001-202607170008',
    '7f7a1008-6178-4d01-9001-202607170008',
    '8f7a1008-6178-4d01-9001-202607170008',
    '新增书签页面使用自然表单布局',
    '新增书签是完整页面，不应该在深色主题下看起来像悬浮弹窗。表单需要减少大卡片包裹和多余底色，让网址识别、名称、标签、描述、快照与底部操作形成自然的纵向流程。',
    'bookmark',
    '新增书签页已改为自然页面表单，压缩了描述和底部操作高度，并保持保存、取消按钮在底部居中可见。'
  ),
  (
    '6f7a1009-6178-4d01-9001-202607170009',
    '7f7a1009-6178-4d01-9001-202607170009',
    '8f7a1009-6178-4d01-9001-202607170009',
    '宽屏自适应工作区与界面缩放建议',
    '工作台、书签、笔记、云空间、资源中心和管理页面会根据可用宽度自动调整内容区与卡片列数；在较紧凑的桌面视口下，轻笺会提供一次性的界面缩放建议，并允许随时在设置中切换。',
    'experience',
    '宽屏工作区、自适应卡片网格和界面缩放建议已上线，覆盖常见桌面分辨率。'
  ),
  (
    '6f7a1010-6178-4d01-9001-202607170010',
    '7f7a1010-6178-4d01-9001-202607170010',
    '8f7a1010-6178-4d01-9001-202607170010',
    '共建轻笺：公开需求、开发答复与上线进度',
    '桌面端游客可以查看公开需求与真实开发进度；注册用户可以提交建议、表达支持并接收状态通知。建议经过审核后才会公开，官方规划与用户建议会始终明确区分。',
    'experience',
    '共建轻笺首版已上线。移动端不主动展示入口，但保留链接直达能力。'
  );

INSERT INTO feature_requests
  (id, title, content, category, source_type, submitter_user_id, show_identity,
   moderation_status, progress_status, developer_reply, release_url, vote_count,
   published_at, released_at, create_time, update_time, del_flag)
SELECT
  seed.id, seed.title, seed.content, seed.category, 'user', @root_user_id, 1,
  'published', 'released', seed.developer_reply, '/updateLogs', 0,
  NOW(), NOW(), NOW(), NOW(), 0
FROM feature_request_user_seed seed
WHERE @root_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM feature_requests existing
    WHERE existing.id = seed.id
       OR (existing.source_type = 'user' AND existing.submitter_user_id = @root_user_id AND existing.title = seed.title)
  );

INSERT INTO feature_request_updates
  (id, request_id, type, content, actor_user_id, create_time)
SELECT
  seed.created_update_id,
  seed.id,
  'submitted',
  '用户提交了产品建议',
  @root_user_id,
  NOW()
FROM feature_request_user_seed seed
JOIN feature_requests request ON request.id = seed.id
WHERE NOT EXISTS (
  SELECT 1 FROM feature_request_updates existing WHERE existing.id = seed.created_update_id
);

INSERT INTO feature_request_updates
  (id, request_id, type, content, from_status, to_status, actor_user_id, create_time)
SELECT
  seed.release_update_id,
  seed.id,
  'release',
  '功能已经上线，详细变化可查看更新日志',
  'evaluating',
  'released',
  @root_user_id,
  NOW()
FROM feature_request_user_seed seed
JOIN feature_requests request ON request.id = seed.id
WHERE NOT EXISTS (
  SELECT 1 FROM feature_request_updates existing WHERE existing.id = seed.release_update_id
);

DROP TEMPORARY TABLE feature_request_user_seed;

SELECT source_type, progress_status, COUNT(*) AS total
FROM feature_requests
WHERE del_flag = 0 AND moderation_status = 'published'
GROUP BY source_type, progress_status;
