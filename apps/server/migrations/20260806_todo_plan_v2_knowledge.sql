-- 2026-08-06 待办「任务计划 × 每项提醒」v2 帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- 1) 新增完整概念说明，回答“重复任务和周期提醒有什么区别”等核心问题。
SET @todo_plan_v2_id = 'b5ce7892-e35a-4f25-ad6f-1e1bfafc4a65';
SET @todo_plan_v2_title = '任务计划与每项提醒：重复任务、催办、开始时间和截止时间怎么设置';
SET @todo_plan_v2_content = '<h1>任务计划和提醒计划是两件事</h1><p><b>任务计划</b>决定要生成多少个可独立完成的任务实例；<b>每项提醒</b>决定每个实例要在什么时候、通过什么渠道通知。每天都有一节课，应使用“按日程重复”；只有一件事但想每天催一次，应使用“仅一次 + 多次催办”。两者可以分别开关，不再互相推断。</p><h2>任务计划的三种方式</h2><ul><li><b>仅一次</b>：只创建一个任务。</li><li><b>按日程重复</b>：按每天、每周或每月预先生成独立实例。某一天没有完成，不会阻止下一天出现。</li><li><b>完成后再次安排</b>：只有完成当前实例，才从实际完成时刻起计算下一项，适合浇花、复查等完成间隔型任务。</li></ul><p>按日程重复可按次数、截止日期或长期运行结束。有限计划最多 366 项；长期计划按滚动窗口生成，不会一次创建海量数据。修改或删除系列任务时，可以选择“仅本次”“本次及以后”或“整个系列”；历史已完成项不会被整个系列修改重写。</p><h2>开始时间和截止时间</h2><p>开始时间表示任务应何时出现或开做，截止时间表示最晚何时完成。比如课程 14:00 开始、17:30 截止，两者都应填写。提醒可以绑定开始时刻、固定时刻或截止前若干分钟，因此“每天提醒一次”不再是没有具体时间的模糊设置。</p><h2>每项提醒的三种方式</h2><ul><li><b>不提醒</b>：只展示任务，不发送通知。</li><li><b>提醒一次</b>：每个实例按开始时、固定时刻或截止前提醒一次。</li><li><b>多次催办</b>：从首个提醒时刻起按间隔通知，完成、到达截止或达到最大次数后停止；每项最多 20 次。</li></ul><p>站内和邮箱是独立投递渠道。免打扰默认把提醒延后一次；如果延后会越过截止时间，则跳过，避免过期轰炸。卡片会显示下一提醒、剩余催办次数和系列进度。</p><h2>过去日期不会被静默改写</h2><p>如果首项日期已经过去，保存前必须明确选择：保留为逾期、从今天重新开始并保持次数，或跳过已错过实例。预览会展示首末日期、实例数和提醒投递数，确认后才创建。</p><h2>旧版任务如何处理</h2><p>升级前的重复任务仍保持“完成本项后按旧截止日期平移下一项”的历史行为，旧周期提醒也继续由旧调度器处理，不会被自动解释成新规则。编辑旧任务时会标记“旧版完成触发重复 / 旧版多次提醒”；如需转换，应先查看新计划权威预览再确认。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @todo_plan_v2_id, @todo_plan_v2_title, @todo_plan_v2_content,
  '帮助中心', 'public', 'html', 918, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @todo_plan_v2_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @todo_plan_v2_title);

UPDATE knowledge_base
SET content = @todo_plan_v2_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 918,
    updated_by = NULL
WHERE id = @todo_plan_v2_id OR title = @todo_plan_v2_title;

-- 2) 更新快速添加 / 完整编辑器说明。
-- 各环境的历史帮助条目 ID 可能不同：优先复用同语义正式条目，避免重复检索结果；都不存在时再新增。
SET @action_center_help_default_id = '7bcbe44c-e762-4c87-97b4-d306e3306622';
SET @action_center_help_title = '快速添加、待整理与待办怎么使用';
SET @action_center_help_id = COALESCE(
  (
    SELECT id
    FROM knowledge_base
    WHERE id = @action_center_help_default_id
       OR title IN (
         @action_center_help_title,
         '工作台地址与快速添加：书签、笔记、文件和待办',
         '待处理：待整理与待办怎么使用'
       )
    ORDER BY (id = @action_center_help_default_id) DESC, sort DESC
    LIMIT 1
  ),
  @action_center_help_default_id
);
SET @action_center_help_content = '<h1>快速添加、待整理与待办怎么使用</h1><h2>快速添加资源</h2><p>电脑端的“快速添加”支持网址、文字、文件和待办。添加文件时可以选择文件、拖入文件，也可以直接按 Ctrl/Command + V 粘贴剪贴板中的图片或文件。网址、文字和文件会先进入待整理，你可以稍后补充标签和位置；移动端快速添加只收集书签、笔记和文件，待办从底部“待办”入口创建。</p><h2>快速创建待办</h2><p>切换到“待办”后，只需要填写标题，也可以顺手选择无日期、今天或明天，以及低、普通或高优先级。点击“立即创建”会直接保存到待办列表；点击“完善详情”会保留当前草稿并打开完整编辑器。</p><h2>完整编辑待办：先设置任务计划，再设置每项提醒</h2><p>完整编辑器在电脑端从右侧打开，在移动端从底部打开。任务计划决定创建一个任务，还是按每天、每周、每月生成多个独立实例，或完成本项后再次安排；每项提醒只决定每个实例在开始时、固定时刻或截止前如何通知。需要连续催办时选择“多次催办”，不要用重复任务代替提醒。保存前的权威预览会显示首末日期、实例数量和站内/邮箱投递数量。</p><h2>待整理与待办的边界</h2><p>待整理只管理需要归类的书签、笔记和文件；待办是独立的行动对象，通过列表、议程和日历推进。两者不会混用标签筛选和批量操作，完成或删除待办也不会修改关联资料。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @action_center_help_id, @action_center_help_title, @action_center_help_content,
  '帮助中心', 'public', 'html', 917, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @action_center_help_id);

UPDATE knowledge_base
SET content = @action_center_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    updated_by = NULL
WHERE id = @action_center_help_id;

-- 3) 更新 AI 创建待办说明：简单待办走轻量工具，复杂计划必须服务端预览与确认。
SET @ai_todo_id = 'c7e41d92-3b60-4f18-8a5d-6e2f9c04b7d1';
SET @ai_todo_content = '<h1>让 AI 帮你创建待办和任务计划</h1><p>普通单条待办可以直接说“创建一个明天 21 点交材料的待办”。重复或催办计划可以说“从 8 月 6 日开始，每天 14:00 学习、17:30 截止，共 30 次，每项开始时站内和邮箱提醒一次”“完成浇花后 3 天再次安排”“截止前每小时催我，最多 4 次”。</p><h2>AI 不自己心算计划</h2><p>AI 只提取标题、日期、时区、任务计划和提醒意图；首末日期、实例数、提醒时刻与投递数都由服务端确定性计算。复杂计划会先展示确认卡，确认卡中的“任务实例数”和“提醒投递数”含义不同：30 个任务、两个渠道各提醒一次，就是 30 个实例和 60 条投递。确认前不会写入，重复提交同一确认也不会重复创建。</p><h2>过去日期与歧义</h2><p>首项已经过去时，AI 必须请你选择保留逾期、从今天重新开始或跳过错过项，不能擅自平移。没有说明提醒时刻时也应先澄清或让你核对确认卡。请特别检查时区、开始时间、截止时间、次数和结束日期。</p><h2>支持范围</h2><p>AI 可以创建仅一次、每日/每周/每月按日程重复、完成后再次安排的任务，也可以设置不提醒、每项提醒一次或多次催办，支持站内与邮箱渠道。AI 仍只会修改单条待办的完成/重新打开状态；系列编辑、删除、跳过、暂停、恢复和旧版转换请在待办页面操作。</p><h2>创建后在哪里看</h2><p>确认后回执会写明生成的实例数和提醒投递数。到待办页可查看系列进度、下一提醒，并在编辑或删除时选择作用范围。</p>';

UPDATE knowledge_base
SET content = @ai_todo_content,
    updated_by = NULL
WHERE id = @ai_todo_id;

-- 4) 同步 AI 能力总览，避免知识库仍声称不能创建提醒和重复计划。
SET @capability_id = '86d4a1b5-5757-40e9-b667-2a66d4a2fc7b';
SET @capability_content = '<h2>可查询</h2><p>轻笺智域能查自己的书签、笔记及正文、云文件和文件夹、标签、待办、回收站、链接健康、通知、反馈、登录设备、成长、积分、周挑战、商店、抽奖、回顾、AI 额度和存储；也能搜索帮助知识或读取用户给出的 HTTP/HTTPS 网页。</p><h2>可执行：创建笔记、待办计划、书签与标签</h2><p>支持创建 Markdown 笔记、图片笔记、普通待办，以及带每日/每周/每月重复、完成后再次安排、每项提醒或多次催办的完整任务计划；也支持创建书签和标签、把临时附件保存到云空间、从回收站恢复，以及把已有待办标记完成或重新打开。所有数据变更都会先展示确认，复杂任务计划由服务端计算后再确认。</p><h2>边界：哪些操作 AI 暂时不做</h2><p>AI 暂不直接修改或删除待办及系列，不删除笔记书签文件、不修改笔记标题正文，也不执行彻底删除。需要系列暂停、跳过、转换或调整作用范围时请到待办页。普通用户只能访问自己的私有数据，游客不能执行账号写入；管理员专属查询不向普通账号开放。</p>';

UPDATE knowledge_base
SET content = @capability_content,
    updated_by = NULL
WHERE id = @capability_id;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@todo_plan_v2_id, @action_center_help_id, @ai_todo_id, @capability_id);

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。
