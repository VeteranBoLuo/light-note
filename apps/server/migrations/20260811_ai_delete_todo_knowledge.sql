-- 2026-08-11 AI 安全删除待办能力帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- 待办 Agent 操作说明：补充删除、任务系列范围和二次确认边界。
SET @todo_agent_help_id = 'd2bda758-2f03-498d-9906-ca3f2ebecd51';
SET @todo_agent_help_old_title = 'AI 助手如何查询待办、待整理并安全修改待办状态';
SET @todo_agent_help_title = 'AI 助手如何查询、修改和安全删除待办';
SET @todo_agent_help_content = '<h1>使用 AI 查询和处理待办</h1><p>轻笺智域可以读取当前账号的待办与待整理摘要，也可以在你确认后修改一条明确待办的状态或删除它。</p><h2>修改状态</h2><p>你可以说“把待办整理发票标记为完成”或“重新打开待办整理发票”。目标不唯一时会先让你选择，然后再展示标准确认卡。</p><h2>删除待办</h2><p>你可以说“删除待办整理发票”，也可以在刚创建或查询完一条待办后说“把刚才那个待办删掉”。AI 会用真实待办 ID 重新校验归属和版本，展示删除范围、当前状态、截止时间、优先级与提醒影响；点击确认前不会删除。普通待办会软删除并进入回收站。</p><h2>任务系列范围</h2><p>删除重复任务时必须明确说明“仅当前项”“当前及以后”或“整个系列”。后两种范围只删除对应范围内尚未完成的项目并结束系列，已完成历史保留。范围没有说清时 AI 必须先询问，不会默认删除整个系列。</p><h2>执行安全规则</h2><ul><li>确认卡出现不代表已执行，只有点击确认并收到服务端成功回执后才算完成；</li><li>确认前目标已变化、被删除或不再属于当前账号时，操作会失败关闭；</li><li>重名目标先选择再确认，选择卡不能替代删除确认；</li><li>不支持批量删除多条独立待办、清空待办或永久删除。</li></ul><h2>当前范围</h2><p>AI 可以创建待办和完整任务计划、修改单条待办的完成状态，以及删除单条待办或明确范围的任务系列。标题、时间、优先级、清单、提醒和系列规则的编辑仍请在待办页操作。游客和管理员代管上下文不能通过 AI 修改或删除待办。</p>';

UPDATE knowledge_base
SET title = @todo_agent_help_title,
    content = @todo_agent_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    updated_by = NULL
WHERE id = @todo_agent_help_id OR title IN (@todo_agent_help_old_title, @todo_agent_help_title);

-- 同步《让 AI 创建待办》与能力总览，避免检索到旧的“不支持删除”说法。
SET @ai_todo_id = 'c7e41d92-3b60-4f18-8a5d-6e2f9c04b7d1';
SET @ai_todo_content = '<h1>让 AI 帮你创建和处理待办</h1><p>普通单条待办可以直接说“创建一个明天 21 点交材料的待办”。重复或催办计划可以说“从 8 月 11 日开始，每天 14:00 学习、17:30 截止，共 30 次，每项开始时站内和邮箱提醒一次”。</p><h2>AI 不自己心算计划</h2><p>AI 只提取标题、日期、时区、任务计划和提醒意图；首末日期、实例数、提醒时刻与投递数都由服务端确定性计算。复杂计划会先展示确认卡，确认前不会写入。</p><h2>修改与删除</h2><p>AI 可以把一条明确待办标记为完成或重新打开，也可以在你确认后删除单条待办。对任务系列，你必须说明只删除当前项、当前及以后或整个系列；未说明时 AI 不会猜测。标题、时间、优先级、清单、提醒、系列规则编辑与跳过、暂停、恢复仍请在待办页操作。</p><h2>安全边界</h2><p>无论创建、修改状态还是删除，确认卡都不代表已执行。只有点击确认并收到服务端成功回执后才算完成；目标重名、版本变化、归属不符或系列范围不明时会失败关闭。AI 不支持清空待办、批量删除多条独立待办或永久删除。</p>';
UPDATE knowledge_base
SET content = @ai_todo_content,
    updated_by = NULL
WHERE id = @ai_todo_id;

SET @capability_id = '86d4a1b5-5757-40e9-b667-2a66d4a2fc7b';
SET @capability_content = '<h2>可查询</h2><p>轻笺智域能查自己的书签、笔记及正文、云文件和文件夹、标签、待办、回收站、链接健康、通知、反馈、登录设备、成长、积分、周挑战、商店、抽奖、回顾、AI 额度和存储；也能搜索帮助知识或读取用户给出的 HTTP/HTTPS 网页。</p><h2>可执行：创建、待办状态与安全删除</h2><p>支持创建 Markdown 笔记、图片笔记、普通待办和完整任务计划，也支持创建书签和标签、把临时附件保存到云空间、从回收站恢复，以及把已有待办标记完成、重新打开或在确认后删除。任务系列删除必须明确作用范围。所有数据变更都会先展示确认。</p><h2>边界：哪些操作 AI 暂时不做</h2><p>AI 暂不直接编辑待办标题、时间、优先级、清单、提醒或系列规则，不删除笔记书签文件，也不执行批量清空和彻底删除。系列跳过、暂停、恢复和转换请到待办页操作。普通用户只能访问自己的私有数据，游客不能执行账号写入；管理员专属查询不向普通账号开放。</p>';
UPDATE knowledge_base
SET content = @capability_content,
    updated_by = NULL
WHERE id = @capability_id;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@todo_agent_help_id, @ai_todo_id, @capability_id);

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。
