-- 2026-08-04 AI 创建待办与 AI 笔记格式（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。
--
-- 背景：本轮上线了 create_todo（AI 可创建待办，支持截止时间与优先级），并明确了
-- AI 生成的笔记固定为 Markdown 类型。知识库若不同步，AI 被问「能帮我建待办吗」
-- 只会照旧回答不支持——它答的是知识库，不是自己的工具表。
--
-- 三部分：
-- 1) 更新既有《AI助手能查询什么、能执行什么、哪些操作需要确认》：可执行清单此前既没有
--    新上线的「创建待办」，也漏了早已可用的「完成/重新打开待办」，边界也没写清不支持改删。
-- 2) 新增《让 AI 创建待办》：怎么说、时间怎么表达、支持与不支持的范围。
-- 3) 新增《AI 生成的笔记是什么格式》：固定 Markdown，可在笔记详情页切换富文本。
--
-- 标题与各级小标题里同时写「待办 / 任务 / 提醒 / 截止时间」「Markdown / 富文本 / 格式」等
-- 说法：检索按 title(boost 5) 与 heading(boost 2.5) 打分，同义词覆盖到这两处即可，
-- 不必改 knowledgeService 的 QUERY_ALIAS_RULES。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- 1) 修正能力清单：补待办写能力与其边界
SET @capability_id = '86d4a1b5-5757-40e9-b667-2a66d4a2fc7b';
SET @capability_content = '<h2>可查询</h2><p>轻笺智域能查自己的书签、笔记及正文、云文件和文件夹、标签、待办、回收站、链接健康、通知、反馈、登录设备、成长、积分、周挑战、商店、抽奖、回顾、AI 额度和存储；也能搜索帮助知识或读取用户给出的 HTTP/HTTPS 网页。</p><h2>可执行：创建笔记、待办、书签与标签</h2><p>支持创建 Markdown 笔记、图片笔记、待办（可带截止时间和优先级）、书签、标签，把临时附件保存到云空间，以及从回收站恢复；也支持把已有待办标记完成或重新打开。写操作默认先生成确认卡，确认前不会写入，也不能声称成功。</p><h2>边界：哪些操作 AI 暂时不做</h2><p>AI 暂不支持修改或删除待办、删除笔记书签文件、修改笔记标题正文、彻底删除数据这类操作，遇到这类请求它会明确说明未执行，请到对应页面手动处理。普通用户只能访问自己的私有数据，游客不能执行账号写入；管理员专属的用户、日志、安全和运营查询不向普通账号开放。</p>';

UPDATE knowledge_base
SET content = @capability_content,
    updated_by = NULL
WHERE id = @capability_id;

-- 2) 新增：让 AI 创建待办
SET @ai_todo_id = 'c7e41d92-3b60-4f18-8a5d-6e2f9c04b7d1';
SET @ai_todo_title = '让 AI 创建待办（任务、提醒）：怎么说、截止时间和优先级';
SET @ai_todo_content = '<h1>让 AI 帮你创建待办</h1><p>在轻笺智域里直接说要记一件事就行，例如「创建一个今天晚上 21 点的待办，标题是交材料」「帮我加一条任务：下周三之前整理会议记录，优先级高」。AI 会先给出一张确认卡，上面写着待办标题、解析出的截止时间和优先级，你点「确认执行」之后才真正创建；点取消则什么都不会写入。</p><h2>截止时间怎么写：今天晚上、明天上午、下周三</h2><p>可以直接用日常说法，例如「今天晚上 21 点」「明天上午十点」「下周三下午三点」，AI 会换算成具体时间。请务必核对确认卡上显示的「截止时间」那一行是不是你要的时刻，尤其是跨天和跨周的说法；不对就点取消重新说一次，或者说得更具体，例如直接给出日期「2026 年 8 月 10 日 15:00」。不写时间也可以，那样会创建一条没有截止时间的待办，之后在待办页补上即可。</p><h2>优先级与说明</h2><p>说「优先级高」「重要」会创建为高优先级，说「不着急」「低优先级」是低优先级，不说则是普通优先级。你还可以补一句说明，例如「内容是去深圳打篮球」，这段会写进待办的说明字段。</p><h2>可以在一句话里同时创建笔记和待办</h2><p>例如「分析这个书签，生成一篇笔记，然后创建一个今天晚上 21 点的待办」，AI 会分别给出创建笔记和创建待办两张确认卡，你可以逐张确认或取消，互不影响。如果你要求的操作里有 AI 暂时做不到的部分，它会明确告诉你哪部分没有执行，不会假装做完。</p><h2>AI 暂不支持修改和删除待办</h2><p>目前 AI 能创建待办，也能把已有待办标记为已完成或重新打开，但不能修改待办的标题、时间、优先级和清单，也不能删除待办。需要改或删时请到待办页手动操作。清单子项、周期重复规则和提醒渠道也需要在待办编辑页设置，AI 创建时不会代填。</p><h2>创建后在哪里看</h2><p>确认后回执里会写明待办标题和截止时间，到待办页即可看到，移动端在底部导航的「待办」里。如果发现优先级或时间不对，直接在待办页编辑即可。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_todo_id, @ai_todo_title, @ai_todo_content,
  '帮助中心', 'public', 'html', 915, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_todo_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_todo_id);

UPDATE knowledge_base
SET content = @ai_todo_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 915,
    updated_by = NULL
WHERE id = @ai_todo_id OR title = @ai_todo_title;

-- 3) 新增：AI 生成的笔记是什么格式
SET @ai_note_format_id = 'f4a8b207-9c31-4d6e-b85f-2a71e0c34d96';
SET @ai_note_format_title = 'AI 生成的笔记是什么格式：Markdown 与富文本怎么切换';
SET @ai_note_format_content = '<h1>AI 创建的笔记固定是 Markdown 格式</h1><p>让 AI 生成或合并笔记时，它产出的正文是 Markdown 格式，创建出来的笔记类型也是 Markdown。即使你要求「生成一篇 HTML 笔记」或「富文本笔记」，AI 目前也只能给出 Markdown 草稿，它会在回答里说明这一点，不会默默当成已经满足。</p><h2>创建后怎么切换成富文本</h2><p>轻笺的笔记支持 Markdown 与富文本两种类型，并且可以互相转换。确认创建之后打开这篇笔记，在笔记详情页切换类型即可：Markdown 内容渲染为富文本一般不会丢失内容；反方向从富文本切到 Markdown 时，待办勾选状态会保留，但文字颜色、表格样式等部分富文本样式可能无法完整保留。切换后还可以点「撤回切换」恢复。</p><h2>为什么不直接生成富文本</h2><p>Markdown 是纯文本结构，标题、列表、引用和代码块都能稳定表达，也便于在确认卡里预览和核对。需要富文本效果时，用上面的切换即可，不需要重新让 AI 生成一遍。</p><h2>手动创建笔记时不受这个限制</h2><p>自己在笔记库新建笔记时可以直接选择富文本或 Markdown，两种都能正常使用；这里说的只是 AI 生成笔记这一条路径。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_note_format_id, @ai_note_format_title, @ai_note_format_content,
  '帮助中心', 'public', 'html', 913, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_note_format_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_note_format_id);

UPDATE knowledge_base
SET content = @ai_note_format_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 913,
    updated_by = NULL
WHERE id = @ai_note_format_id OR title = @ai_note_format_title;

-- 4) 修正既有《AI 助手如何查询待办、待整理并安全修改待办状态》的「当前范围」：
--    原文只说支持修改状态，读到这条的用户会以为 AI 不能创建待办。用 REPLACE 精确替换那一段，
--    不整段重写，避免与该条目其他内容脱节。
SET @todo_status_id = 'd2bda758-2f03-498d-9906-ca3f2ebecd51';
SET @todo_scope_old = '<p>当前只支持修改当前账号的一条待办状态，不支持批量完成、修改清单子项、编辑提醒或代其他账号写入。';
SET @todo_scope_new = '<p>AI 现在也可以创建待办（可带截止时间和优先级），说法与注意事项见《让 AI 创建待办》。除创建之外，当前只支持修改当前账号的一条待办状态，不支持修改待办的标题、时间、优先级，不支持删除待办、批量完成、修改清单子项、编辑提醒或代其他账号写入。';

UPDATE knowledge_base
SET content = REPLACE(content, @todo_scope_old, @todo_scope_new),
    updated_by = NULL
WHERE id = @todo_status_id
  AND content LIKE CONCAT('%', @todo_scope_old, '%');

COMMIT;

-- 执行后需重启后端（pm2 restart app）：知识检索有 5 分钟进程内缓存，否则新内容不会立即生效。
