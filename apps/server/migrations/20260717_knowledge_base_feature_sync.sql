-- 2026-07-17 近期用户功能知识库总同步（MySQL 5.7 兼容、幂等）
-- 仅更新 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- 1. AI 助手总览：移除“写操作仅管理员、不能读取网页”等过时说明。
SET @ai_guide_id = 'd16dabc0-7366-1173-ac9a-a7f89586e39b';
SET @ai_guide_title = 'AI 助手（轻笺智域）使用说明';
SET @ai_guide_content = '<h1>AI 助手（轻笺智域）使用说明</h1><p>轻笺智域是轻笺的全局 AI 助手。电脑端可点击页面右下角入口，或在 macOS 按 <code>⌘ + /</code>、Windows/Linux 按 <code>Ctrl + /</code> 打开；也可以直接访问 <a href="/aiAssistant">AI 助手页面</a>。设置页的“全局快捷键”会显示当前设备对应的按键。</p><h2>窗口与全屏</h2><p>电脑端默认以右侧抽屉打开，可以最大化为全屏对话，再点击还原按钮回到抽屉。全屏时点击笔记等站内来源，助手会先退出全屏或收起，再打开目标内容，避免页面被遮住；外部网页来源会按链接规则打开。</p><h2>查询、整理与引用</h2><ul><li>查询自己的书签、笔记、文件、标签、通知、回收站、成长、积分、AI 额度和云空间用量。</li><li>跨模块搜索内容，读取网页链接，并结合你通过“添加资源”选择的笔记、书签、文件或标签回答。</li><li>通过“上传文件”添加本地临时文件，或从云空间选择文件；解析完成后可以摘要、问答或整理成笔记。</li><li>回答使用资料时会展示来源卡片。点击站内笔记、书签或文件可以打开对应内容；文件来源尽量保留页码、章节、行号或段落定位。</li></ul><h2>操作与确认</h2><p>创建笔记、创建书签、创建标签、恢复回收站等支持的写操作会先生成确认卡片；只有你明确确认后才执行。可用能力会根据账号角色、数据归属和当前页面变化，助手不能访问其他普通用户的私有数据。</p><h2>工具进度</h2><p>处理中默认显示“正在读取资料、正在准备回答”等面向用户的进度，不直接用内部工具名打断阅读。需要排查或了解细节时，可以展开查看已读取的数据项、成功数量和失败项。</p><h2>隐私与准确性</h2><p>资源归属和权限会由后端重新校验。文件正文、网页和用户资料都按不可信内容处理，不能借内容中的指令越权。AI 回答和 OCR 识别都可能出错；恢复码、密钥、账号、金额等关键内容必须回看原始来源核对。</p>';

UPDATE knowledge_base
SET content = @ai_guide_content, category = '帮助中心', status = 'public', type = 'html', sort = 99, updated_by = NULL
WHERE id = @ai_guide_id OR title = @ai_guide_title;

-- 2. AI 助手交互专题：让“全屏点击来源没反应、工具名要不要看”等问题稳定命中。
SET @ai_interaction_id = '2af1b75a-8155-46d4-8e8a-acdeccad8492';
SET @ai_interaction_title = '轻笺智域：抽屉、全屏、来源跳转与处理进度';
SET @ai_interaction_content = '<h2>抽屉与全屏</h2><p>电脑端的轻笺智域默认从右侧抽屉打开，适合一边看当前页面一边提问。需要长时间阅读或处理较长回答时，可以点击顶部“最大化”；再次点击“还原”即可回到抽屉。移动端继续使用适合窄屏的完整页面布局。</p><h2>点击引用来源</h2><p>回答下方的来源卡片可以打开对应笔记、书签、文件或网页。全屏状态下点击站内来源时，助手会先让出页面再导航，因此目标内容不会被全屏层遮住。如果来源已经失效或没有访问权限，会显示明确提示，而不是静默无反应。</p><h2>为什么只显示处理进度</h2><p>正常提问时，界面优先展示“正在理解问题、正在读取资料、正在组织回答”等简洁进度。内部工具调用不会全部平铺展示；完成后可以按需展开详情，查看参考了多少项数据以及是否存在部分读取失败。</p><h2>快捷键</h2><p>macOS 使用 <code>⌘ + /</code>，Windows/Linux 使用 <code>Ctrl + /</code>，可从任意非输入状态页面打开助手并聚焦输入框。助手已打开时再次按下会重新聚焦，不会重复创建窗口；<code>Esc</code> 可关闭。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @ai_interaction_id, @ai_interaction_title, @ai_interaction_content,
  '帮助中心', 'public', 'html', 100, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_interaction_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_interaction_id);

UPDATE knowledge_base
SET content = @ai_interaction_content, category = '帮助中心', status = 'public', type = 'html', sort = 100, updated_by = NULL
WHERE id = @ai_interaction_id OR title = @ai_interaction_title;

-- 3. 笔记模板专题。
SET @note_template_id = 'a475c4c8-c2c5-4b91-8ff1-a99232e9f98e';
SET @note_template_title = '笔记模板：内置模板与我的模板';
SET @note_template_content = '<h1>笔记模板</h1><p>在笔记库点击“新建笔记”，可以从空白 HTML、空白 Markdown、内置模板和“我的模板”中选择。模板卡片会标明编辑器类型和结构预览，选中后直接创建一篇可继续编辑的新笔记。</p><h2>内置模板</h2><p>目前提供 7 种结构化模板：日报、周报、会议纪要、读书笔记、项目计划、复盘和知识卡片。日报、周报等偏文字结构的模板使用 Markdown；会议纪要使用 HTML，便于直接编辑表格与行动项。</p><h2>模板变量</h2><p>标题和正文支持 <code>{{date}}</code>、<code>{{datetime}}</code>、<code>{{weekday}}</code> 等变量。使用模板新建笔记时会自动替换为当前日期、时间或星期。</p><h2>保存自己的模板</h2><p>打开一篇笔记后，点击顶部“存为模板”，填写模板名称、默认标题和说明，即可保存当前正文和编辑器类型。以后从“我的模板”选择即可复用。HTML 笔记里的已上传图片会记录模板引用，避免原笔记删除后模板图片立即失效。</p><h2>删除模板</h2><p>“我的模板”显示在新建笔记选择器中，可以从模板卡片删除并进行二次确认。删除模板不会删除已经用它创建的笔记；内置模板为只读，不能删除。</p><p>模板只是新笔记的起点。使用后修改新笔记，不会反向修改模板或其他由同一模板创建的笔记。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @note_template_id, @note_template_title, @note_template_content,
  '帮助中心', 'public', 'html', 100, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @note_template_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @note_template_id);

UPDATE knowledge_base
SET content = @note_template_content, category = '帮助中心', status = 'public', type = 'html', sort = 100, updated_by = NULL
WHERE id = @note_template_id OR title = @note_template_title;

-- 4. 笔记管理总览：补齐模板、置顶、排序、批量标签和移动端入口。
SET @note_guide_id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb';
SET @note_guide_title = '笔记管理';
SET @note_guide_content = '<h1>笔记管理</h1><p>笔记库用于创建、筛选和整理 HTML 富文本或 Markdown 笔记。访问地址：<a href="/noteLibrary">/noteLibrary</a>。</p><h2>浏览与筛选</h2><ul><li>支持卡片视图和列表视图，桌面端可以搜索标题或正文，并按标签筛选。</li><li>可以拖动调整笔记顺序。置顶笔记始终位于普通笔记之前，置顶分组和普通分组分别保存顺序。</li><li>桌面端右键笔记、移动端打开“更多”菜单，可置顶、取消置顶、关联标签、加入待处理或移入回收站。</li></ul><h2>批量整理</h2><p>进入批量模式后，可以选择当前筛选结果、批量关联或移除标签，也可以批量移入回收站。批量操作只影响当前选中的笔记，并在危险操作前确认。</p><h2>新建笔记与模板</h2><p>点击“新建笔记”后，可选择空白 HTML、空白 Markdown、7 种内置模板或自己保存的模板。模板支持日期变量和默认标题。详情请搜索“笔记模板”。</p><h2>编辑与保存</h2><p>HTML 模式适合表格、图片和所见即所得排版；Markdown 模式适合纯文本写作和实时预览。编辑器支持目录导航、标签、导出和自动保存；手动保存可使用按钮或当前系统对应的保存快捷键。</p><h2>AI 能力</h2><p>笔记库的“AI 智能整理”可以为未整理内容推荐并应用标签。笔记详情的 AI 助手可以润色、优化标题、摘要、纠错、扩写或翻译当前笔记，应用结果前请核对内容。</p><h2>删除与恢复</h2><p>普通删除会把笔记移入回收站，可在保留期内恢复；删除自存模板不会删除已经创建的笔记。模板和笔记中的图片会独立维护引用关系，避免仍被使用的图片被误清理。</p>';

UPDATE knowledge_base
SET content = @note_guide_content, category = '帮助中心', status = 'public', type = 'html', sort = 99, updated_by = NULL
WHERE id = @note_guide_id OR title = @note_guide_title;

-- 5. 快捷键总览：与设置页和独立快捷键条目保持一致。
SET @keyboard_guide_id = 'c49eb4fa-b3f4-4c89-8826-cf85060eb84b';
SET @keyboard_guide_title = '键盘快捷键指南';
SET @keyboard_guide_content = '<h1>键盘快捷键指南</h1><h2>全局快捷键（电脑端）</h2><ul><li><strong>全局搜索：</strong>不在输入框或可编辑区域时，按 <code>/</code> 聚焦全局搜索。</li><li><strong>打开 AI 助手：</strong>macOS 按 <code>⌘ + /</code>，Windows/Linux 按 <code>Ctrl + /</code>。助手已打开时会重新聚焦输入框。</li><li><strong>关闭浮层：</strong>多数弹窗、预览和 AI 抽屉可按 <code>Esc</code> 关闭。</li></ul><p>前往“设置 → 全局快捷键”可以查看当前设备对应的按键。全局快捷键不会抢占输入框、编辑器或其他可编辑区域中的正常输入。</p><h2>AI 对话</h2><ul><li><code>Enter</code>：发送消息。</li><li><code>Shift + Enter</code>：换行。</li></ul><h2>笔记编辑</h2><ul><li><code>⌘/Ctrl + S</code>：保存笔记。</li><li><code>⌘/Ctrl + Z</code>：撤销。</li><li><code>⌘/Ctrl + Y</code> 或系统对应组合：重做。</li><li><code>⌘/Ctrl + B</code>、<code>I</code>、<code>U</code>：加粗、斜体、下划线。</li><li><code>⌘/Ctrl + F</code>：在编辑器内查找。</li></ul><h2>云空间</h2><p>复制本地文件后，在云空间页面使用 <code>⌘/Ctrl + V</code> 可以粘贴上传；也支持拖拽和点击上传。</p>';

UPDATE knowledge_base
SET content = @keyboard_guide_content, category = '帮助中心', status = 'public', type = 'html', sort = 99, updated_by = NULL
WHERE id = @keyboard_guide_id OR title = @keyboard_guide_title;

-- 6. 成长与积分：补齐补签窗口、背包和头像框价格差异。
SET @growth_guide_id = '11a03c80-7ecf-117e-9b34-a4425ee43c95';
SET @growth_guide_title = '我的成长与积分系统';
SET @growth_guide_content = '“我的成长”把日常使用变成可查看的等级、积分和奖励。入口：右上角头像菜单 →“我的成长”。\n\n## 等级与经验（EXP）\n- 创建和整理书签、笔记、文件，签到和完成任务会获得经验；最高为 Lv.15“文圣”。\n- 升级会提高云空间基础容量、每日 AI 额度、回收站保留时间和每日免费抽奖次数。经验只增不减，消费积分不会影响等级。\n\n## 签到、补签与任务\n- 每日签到可获得经验和积分；7、30、100、365 天等连签里程碑有积分、永久扩容或补签卡奖励。\n- 补签卡最多持有 2 张，可以补今天之前最近 3 个自然日内的漏签。补签只修复签到记录和连签，不补发当天经验、积分、任务或里程碑奖励。\n- 每日任务、每周挑战和成就需要达到条件后领取；工作台“一键领取”的数字可能来自成长任务或成就，而不只是成长页当前可见的一块卡片。\n\n## 积分与背包\n- 积分是独立消费货币，可通过签到、任务、挑战、成就、里程碑和抽奖获得。\n- “我的背包”展示积分、永久扩容和消耗品。AI 加油包购买或抽中后先进入背包，手动使用才增加当天额度。\n\n## 回顾与装扮\n- 成长页包含签到日历、积分明细、那年今日和本周成长周报。\n- 积分商店的头像框一次兑换永久拥有，可佩戴、切换或卸下；头像框会显示在电脑端和移动端的头像入口。';

UPDATE knowledge_base
SET content = @growth_guide_content, category = '帮助中心', status = 'public', type = 'markdown', sort = 98, updated_by = NULL
WHERE id = @growth_guide_id OR title = @growth_guide_title;

SET @points_guide_id = '11a21140-7ecf-117e-8c23-96d5e1f6a052';
SET @points_guide_title = '积分商店与积分抽奖';
SET @points_guide_content = '在“我的成长”页可以用积分兑换道具、永久扩容和头像框，也可以参与抽奖。\n\n## 积分商店\n- **AI 加油包：150 积分。**兑换后进入背包，使用当天增加 30 万 tokens；未使用不会当天作废。\n- **永久扩容：**512MB 为 800 积分，2GB 为 2500 积分，永久叠加在等级容量之上。\n- **头像框：**鎏金、樱绯、霓虹均为 500 积分；星河为 1200 积分且需要 Lv.8。星河带有更丰富的流光、轨道和彗星效果。头像框一次兑换永久拥有，可反复佩戴或卸下。\n- 补签卡不在商店出售；可通过升级、连签和抽奖获得，最多持有 2 张。\n\n## 积分抽奖\n- 单抽 88 积分，十连 800 积分；奖池包括积分、补签卡、AI 加油包和永久云空间。\n- 每 10 抽有稀有保底。Lv.3 开始获得每日免费抽奖次数，等级越高次数越多，满级每天 5 次。\n- 概率可在抽奖区展开查看；免费抽奖和积分抽奖共享奖品发放与背包规则。';

UPDATE knowledge_base
SET content = @points_guide_content, category = '帮助中心', status = 'public', type = 'markdown', sort = 98, updated_by = NULL
WHERE id = @points_guide_id OR title = @points_guide_title;

-- 7. 产品总览：使用更短但覆盖当前主要入口的版本，避免继续检索到旧版本能力描述。
SET @intro_id = 'd15a4ad0-7366-1173-8ca0-703747c94b8c';
SET @intro_title = '轻笺 · 完整介绍';
SET @intro_content = '<h1>轻笺（Light Note）</h1><p>轻笺是把书签、笔记、云文件和标签网络整合在一起的个人知识管理平台。访问地址：<a href="https://boluo66.top">https://boluo66.top</a>。</p><h2>核心内容</h2><ul><li><strong>书签：</strong>收藏网页、自动获取标题与图标，支持标签、导入导出、链接体检和网页快照。</li><li><strong>笔记：</strong>支持 HTML 富文本与 Markdown、图片、表格、目录、自动保存、导出、置顶排序、批量标签和结构化模板。</li><li><strong>云空间：</strong>上传、预览、分享、下载和管理文件；书签、笔记和文件都可以关联多个标签。</li><li><strong>资源中心：</strong>统一搜索书签、笔记、文件和标签，并通过标签详情与知识图谱发现关联。</li></ul><h2>智能能力</h2><ul><li><strong>轻笺智域：</strong>以对话查询个人内容和产品帮助，支持资源上下文、网页读取、文件解析、来源引用、抽屉与全屏模式，以及确认后创建笔记等安全操作。</li><li><strong>文件问答：</strong>支持 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG 和 WebP；图片型 PDF 与图片使用服务器本地 OCR 提取文字。</li><li><strong>笔记 AI：</strong>润色、优化标题、摘要、纠错、扩写、翻译和生成大纲。</li></ul><h2>效率与回顾</h2><ul><li><strong>工作台与待处理：</strong>查看近期内容、待办和快速创建入口，把暂存资源统一整理。</li><li><strong>成长系统：</strong>等级、签到、任务、积分、背包、抽奖、永久扩容和头像框装扮。</li><li><strong>共建轻笺：</strong>查看公开规划、提交产品建议、补充建议并跟踪开发进度。</li><li><strong>多端：</strong>适配电脑与移动端，支持主题、语言、界面缩放和设备对应的全局快捷键。</li></ul><h2>数据与权限</h2><p>游客只能使用开放的浏览能力；登录用户管理自己的数据；管理员具有受审计的系统管理能力。删除的内容通常先进入回收站，私有数据按账号隔离。轻笺开源并支持自部署，具体限制以当前页面提示和帮助文档为准。</p>';

UPDATE knowledge_base
SET content = @intro_content, category = '帮助中心', status = 'public', type = 'html', sort = 97, updated_by = NULL
WHERE id = @intro_id OR title = @intro_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (
  @ai_guide_id, @ai_interaction_id, @note_template_id, @note_guide_id,
  @keyboard_guide_id, @growth_guide_id, @points_guide_id, @intro_id
)
ORDER BY sort DESC, title;
