-- 2026-08-24 模块化 AI 与当日产品交互的公开帮助知识收口。
-- MySQL 5.7 兼容、幂等；只修改 knowledge_base 公开帮助，不触碰用户业务数据或历史会话。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- 模块 AI 总览：以当前 Skill 注册表和页面入口为准。
SET @module_ai_id = 'd16dabc0-7366-1173-ac9a-a7f89586e39b';
SET @module_ai_title = '模块 AI：按页面使用、材料边界与额度';
SET @module_ai_content = '<h1>模块 AI</h1><p>轻笺不再提供跨模块自由聊天和操作的全局助手。AI 能力放在笔记、书签、文件、待办、资源中心和帮助中心的对应页面中；当前页面和明确选择的资源决定本次任务，不会沿用其他模块或上一次材料。</p><h2>笔记</h2><ul><li>总结或比较当前明确选择的笔记。</li><li>根据所选笔记、书签或文件生成一篇新的 Markdown 笔记。</li><li>在编辑器中润色、改写、摘要、纠错、续写、翻译或生成大纲。</li></ul><p>“生成新笔记”成功后会立即创建并打开一篇已保存的笔记，直接退出编辑器也不会丢失。</p><h2>书签</h2><ul><li>智能识别网址信息和推荐标签。</li><li>网页存档免费保存完整正文；AI 摘要需在已有正文后由用户另行明确生成。</li><li>可分析当前书签，或根据当前书签生成新笔记。</li></ul><h2>文件</h2><p>支持 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG/JPEG 和 WebP，单个文件不超过 20MB。文本文件可总结或生成笔记；多文件可比较；图片会先提取可识别文字再总结。尚在解析、解析失败、没有可靠正文或格式不支持时不会调用模型编造内容。</p><h2>待办</h2><p>“拆解待办”会完整读取当前标题、说明和已有清单，生成简洁或详细的可检查步骤草稿；只有明确应用后才写回当前待办。</p><h2>资源中心与帮助中心</h2><p>资源中心只分析当前明确选中的个人资料；帮助中心的“问问轻笺助手”只检索公开帮助文章，不读取个人笔记、书签、文件、待办或互联网内容。</p><h2>材料与额度</h2><p>不同模块、资源和账号之间不会共享材料。只有真实发出的用户主模型调用才计入 AI 额度；缓存、无材料、本地解析和平台承担的受限协议修复不重复扣用户额度。可从设置中的“AI 用量与计费规则”进入独立页面查看额度和最近消耗。</p>';

UPDATE knowledge_base
SET title = @module_ai_title,
    content = @module_ai_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 99,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @module_ai_id;

-- 额度说明：明确展示三种口径，避免把总可用误解为每日额度。
SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_content = '<h1>AI 额度、用量明细与加油包</h1><h2>三个数字分别表示什么</h2><ul><li><strong>今日等级额度：</strong>随成长等级提升，按当前产品规则每日重置。</li><li><strong>永久加油余额：</strong>不会每日重置；今日等级额度耗尽后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久加油余额之和。</li></ul><p>头像菜单中的 AI 额度显示“当前总可用”，因此可能明显大于每日等级额度。点击后会直接进入独立的“AI 用量与计费”页面。</p><h2>统一计费</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等所有实际模型调用共享同一份额度。用户主调用按 Provider 返回的实际 token 结算；缓存、无材料和本地确定性解析不扣，受限协议修复由平台承担。</p><p>不同任务的材料长度和输出长度不同，实际消耗也会不同。额度不足时系统会在下一次模型调用前拒绝请求，不会事后把余额扣成负数。</p><h2>AI 加油包</h2><p>AI 加油包进入背包后可按产品当前规则转为永久 AI 余额；每日等级额度耗尽后才自动使用。</p>';

UPDATE knowledge_base
SET content = @ai_quota_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @ai_quota_id;

-- 移动端一级导航已经用“快速添加”替代旧全局 AI 入口。
SET @mobile_nav_id = 'f7264b03-6c3c-47b2-a52c-e9e136ccadb4';
SET @mobile_nav_content = '# 移动端底部导航\n\n从左到右依次是：**今日、资料、快速添加、待办、聊天室**。中间强调位用于确定性的快速收集，不是全局 AI 对话入口。\n\n- **今日**：查看今天要处理的待办、待整理和继续处理\n- **资料**：进入最近浏览的书签、笔记库、云空间或标签页\n- **快速添加**：新建书签、笔记、文件或待办\n- **待办**：打开待办列表、议程和日历\n- **聊天室**：进入轻笺公共聊天室\n\n搜索位于移动顶栏；头像入口包含个人资料、成长、设置、资源中心和回收站。模块 AI 只在当前笔记、书签、文件、待办、资源中心或帮助中心内出现。底部一级入口使用替换式导航，不会在返回历史中反复堆叠。';

UPDATE knowledge_base
SET content = @mobile_nav_content,
    category = '帮助中心',
    status = 'public',
    type = 'markdown',
    sort = 1000,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @mobile_nav_id;

SET @mobile_difference_id = '98e89a62-84c0-46b6-adc8-ef0898173878';
SET @mobile_difference_title = '移动端和电脑端入口差异：快速添加、帮助和头像框';
SET @mobile_difference_content = '<h2>数据同步，布局不同</h2><p>书签、笔记、云文件、标签、待办、成长和积分保存在账号中，电脑与移动端同步；导航与操作布局会随屏幕调整。</p><ul><li>移动端底部中间是“快速添加”；电脑端从顶栏加号进入同一组快速创建能力。</li><li>模块 AI 不再占用一级导航，只在当前笔记、书签、文件、待办、资源中心或帮助中心内出现。</li><li>全局快捷键只在电脑端；移动端使用顶栏搜索和页面内按钮。</li><li>帮助中心地址为 <a href="https://boluo66.top/help">/help</a>；公开文章也可从 <a href="https://boluo66.top/helpCenter">/helpCenter</a> 打开。</li><li>头像框佩戴状态跨端同步；移动端从顶栏头像进入个人资料、成长和设置。</li><li>移动回收站使用 <code>/ptrash</code>，电脑端为 <code>/trash</code>。</li></ul>';

UPDATE knowledge_base
SET title = @mobile_difference_title,
    content = @mobile_difference_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    admin_archived = 0,
    updated_by = NULL
WHERE id = @mobile_difference_id;

SET @mobile_guide_id = 'f8546461-4b27-4cac-bfe5-660c1e5d7554';
SET @mobile_guide_content = '<h1>移动端使用指南</h1><p>轻笺的账号数据在电脑、手机浏览器、PWA 和 Android App 间同步；小屏主要调整导航、面板位置和批量操作密度。</p><h2>底部导航</h2><p>依次为今日、资料、快速添加、待办和聊天室。搜索在顶栏，头像入口包含个人资料、成长、设置、资源中心和回收站。</p><h2>模块 AI</h2><p>移动端没有独立的全局 AI 页面。请从当前业务页面进入：笔记库分析所选笔记、笔记编辑器处理当前正文、书签卡片分析当前网页、云空间文件菜单分析当前文件、待办详情拆解任务、资源中心分析明确选择的资料、帮助中心查询公开帮助。</p><h2>布局差异</h2><ul><li>笔记编辑器在小屏使用紧凑工具栏，目录从顶部按钮打开。</li><li>云空间侧栏和批量操作会收进抽屉或更多菜单。</li><li>复杂导入导出和大批量管理更适合电脑端。</li><li>移动浏览器、PWA 与 Android App 共用同一移动布局基线。</li></ul>';

UPDATE knowledge_base
SET content = @mobile_guide_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    admin_archived = 0,
    updated_by = NULL
WHERE id = @mobile_guide_id;

-- 产品总览与登录说明：改为当前模块化能力和游客边界。
SET @overview_id = 'd15a4ad0-7366-1173-8ca0-703747c94b8c';
SET @overview_content = '<h1>轻笺（Light Note）</h1><p>轻笺是把书签、笔记、云文件、待办和标签网络整合在一起的个人知识管理平台。访问地址：<a href="https://boluo66.top">https://boluo66.top</a>。</p><h2>核心内容</h2><ul><li><strong>书签：</strong>收藏网页、智能识别名称与描述、网页存档、标签、导入导出和链接体检。</li><li><strong>笔记：</strong>支持 HTML 富文本、Markdown 和手绘笔记，以及图片、表格、目录、自动保存、版本、导出、模板与标签。</li><li><strong>云空间：</strong>上传、预览、分享、下载和管理文件。</li><li><strong>待办：</strong>支持说明、清单、优先级、开始与截止时间、单次或周期提醒以及关联资料。</li><li><strong>资源中心：</strong>统一搜索书签、笔记、文件、待办和标签，并通过知识图谱发现关联。</li></ul><h2>模块 AI</h2><p>AI 能力位于对应业务页面，不提供跨模块全局助手。它可以分析明确选择的笔记、书签和文件，拆解当前待办，处理当前笔记正文，生成网页存档与摘要，或在帮助中心依据公开文章回答产品问题。不同模块和资源不会互相串用材料。</p><h2>数据与权限</h2><p>游客只能使用明确开放的公开页面和帮助问答；登录用户管理自己的私有数据；管理员能力受权限与审计约束。删除内容通常先进入回收站，私有数据按账号隔离。</p>';

UPDATE knowledge_base
SET content = @overview_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 97,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @overview_id;

SET @login_entry_id = 'b6adab2d-57b1-4e21-bcfb-6fa8ebed1c8c';
SET @login_entry_content = '<p>使用邮箱注册或登录，也可使用 GitHub 授权登录；GitHub 登录没有统一默认密码。忘记邮箱密码时从登录页进入“忘记密码”。游客可以浏览公开内容并在帮助中心询问公开产品说明；管理个人书签、笔记、文件、待办或使用这些私有材料的模块 AI，需要注册并登录。</p>';
UPDATE knowledge_base SET content = @login_entry_content, updated_by = NULL WHERE id = @login_entry_id;

SET @new_user_login_id = '086163eb-3a60-479e-a2c6-abd3b73b3a15';
SET @new_user_login_content = '<h1>新用户注册与登录流程</h1><p>从 <a href="https://boluo66.top/login">登录页</a> 使用邮箱注册或登录，也可以选择 GitHub 授权。GitHub 登录没有统一默认密码；需要邮箱密码登录时，可在“设置 → 账号与安全”设置密码。</p><h2>游客模式</h2><p>游客可以浏览公开页面，并在帮助中心询问公开产品说明。游客不拥有正式账号的私有数据空间；长期保存、跨设备同步、个人资源分析和写入操作都需要先注册或登录。</p><h2>登录异常</h2><ul><li>邮箱密码不匹配：检查输入法和大小写，或使用“忘记密码”。</li><li>GitHub 授权失败：确认网络正常后重新授权。</li><li>重复注册提示：直接登录已有账号，不要重复创建。</li></ul>';
UPDATE knowledge_base SET content = @new_user_login_content, updated_by = NULL WHERE id = @new_user_login_id;

SET @visitor_guide_id = '3ce7f73d-6880-482f-a59e-4ceab7eeb354';
SET @visitor_guide_content = '<h1>游客模式说明</h1><p>游客适合了解公开功能，不等同于已经注册的个人账号。</p><h2>游客可以做什么</h2><ul><li>浏览公开首页、帮助文章和公开分享。</li><li>在帮助中心使用“问问轻笺助手”，回答范围仅限公开帮助文章。</li></ul><h2>需要登录的功能</h2><ul><li>保存和管理个人书签、笔记、云文件、待办和标签。</li><li>使用个人资源作为材料的笔记、书签、文件、待办或资源中心模块 AI。</li><li>访问个人中心、成长、回收站和账号设置。</li></ul><p>需要长期保存或跨设备同步时，请先注册并登录。</p>';
UPDATE knowledge_base SET content = @visitor_guide_content, updated_by = NULL WHERE id = @visitor_guide_id;

-- 笔记模块：批量分析、智能打标签、编辑器处理和新笔记持久化。
SET @note_management_id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb';
SET @old_note_ai_section = '<h2>AI 能力</h2><p>笔记库的“AI 智能整理”可以为未整理内容推荐并应用标签。笔记详情的 AI 助手可以润色、优化标题、摘要、纠错、扩写或翻译当前笔记，应用结果前请核对内容。</p>';
SET @new_note_ai_section = '<h2>AI 能力</h2><p>笔记库的“智能打标签”只为当前筛选或明确选中的笔记推荐标签，复审后才应用；“分析所选笔记”可以总结、比较或根据所选材料生成新笔记。生成成功后新笔记立即保存并打开，直接退出也不会丢失。笔记编辑器的笔记助手只处理当前标题、正文或选区，可润色、优化标题、摘要、纠错、续写、翻译或生成大纲；结果由用户明确插入、替换或保存。</p>';
UPDATE knowledge_base
SET content = REPLACE(content, @old_note_ai_section, @new_note_ai_section),
    updated_by = NULL
WHERE id = @note_management_id;

SET @note_ai_short_id = '4c59f301-19f8-4285-b216-a63c6cef746f';
SET @note_ai_short_title = '笔记助手怎么用：润色、改写、摘要、翻译和插入建议';
SET @note_ai_short_content = '<p>打开一篇笔记进入编辑器后，笔记助手只读取当前笔记的标题、正文或明确选区。可使用润色全文、优化标题、生成摘要、纠错与语病、续写扩展、翻译和生成大纲，也可以补充语气、长度或重点要求。结果先显示在建议区，只有点击插入、替换或保存后才会修改笔记；放大预览可对照原文和生成结果。</p>';
UPDATE knowledge_base SET title = @note_ai_short_title, content = @note_ai_short_content, updated_by = NULL WHERE id = @note_ai_short_id;

SET @note_ai_guide_id = 'aa05d5e7-e7d1-4fe9-8e8e-8f3ccb9f2844';
SET @note_ai_guide_title = '笔记助手使用指南';
SET @note_ai_guide_content = '<h1>笔记助手使用指南</h1><p>笔记助手位于正在编辑的笔记内，只处理当前笔记的标题、正文或明确选区，不读取其他模块材料。</p><h2>支持的操作</h2><ul><li>润色全文、优化标题和生成摘要。</li><li>纠错与语病、续写扩展、翻译和生成大纲。</li><li>选中文字后按明确动作改写选段。</li><li>补充语气、长度、语言或重点等要求。</li></ul><h2>如何应用</h2><p>AI 结果先进入建议区或对比预览，不会自动覆盖正文。确认内容后再选择插入到笔记、替换标题或应用选段；原选区已变化时系统不会写回错误位置。较长生成可以停止、重新生成或在同一结果范围内追问。</p><h2>笔记库中的材料分析</h2><p>需要总结或比较多篇笔记时，请在笔记库明确选择材料后打开“分析所选笔记”。“根据所选笔记生成新笔记”会在生成成功后立即创建并打开已保存的新笔记。</p>';
UPDATE knowledge_base SET title = @note_ai_guide_title, content = @note_ai_guide_content, updated_by = NULL WHERE id = @note_ai_guide_id;

-- 文件模块：入口按共享能力清单显示，图片走 OCR，结果不足时不调用模型猜测。
SET @file_ai_id = '7c377743-1f34-4ab2-939a-bf1594379f23';
SET @file_ai_title = '云空间文件 AI 分析：格式、OCR、处理状态和操作范围';
SET @file_ai_content = '<h1>云空间文件 AI 分析</h1><h2>支持格式</h2><p>支持 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG/JPEG 和 WebP，单个文件不超过 20MB。ZIP、视频、音频、可执行文件等未登记格式不会显示 AI 分析入口。</p><h2>如何打开</h2><p>单个文件可从文件的“更多”菜单选择“AI 分析”；批量模式可勾选已支持的文件后分析。切换文件或重新选择材料时不会沿用上一组结果。</p><h2>可用操作</h2><ul><li>单个文本文件：总结文件、根据文件生成新笔记。</li><li>单张图片：提取并总结可识别文字、根据识别内容生成新笔记。</li><li>多个受支持文件：比较文件、根据所选文件生成新笔记。</li></ul><h2>处理状态</h2><p>文件可能处于等待解析、解析中、已就绪、未发现文字或失败。只有存在可靠正文时才调用模型；没有可读正文时会明确提示，不会描述图片中没有可靠识别的内容。解析范围可能受 20MB、字符数和分块上限限制，结果会说明覆盖不足。</p>';
UPDATE knowledge_base SET title = @file_ai_title, content = @file_ai_content, updated_by = NULL WHERE id = @file_ai_id;

SET @image_note_id = '20bc9db9-5663-410b-a1df-a20c3b780e3a';
UPDATE knowledge_base SET status = 'internal', admin_archived = 1, updated_by = NULL WHERE id = @image_note_id;

-- 书签模块：免费正文存档与显式 AI 摘要分开，分析入口以当前书签为主。
SET @bookmark_management_id = 'ecd1f717-e114-4af2-8aa6-a65094861da8';
SET @bookmark_management_title = '书签管理：搜索筛选、智能打标签、网页存档和链接体检';
SET @bookmark_management_content = '<h2>书签管理入口</h2><p>书签首页为 <a href="https://boluo66.top/home">/home</a>，管理页为 <a href="https://boluo66.top/manage/bookmarkMg">/manage/bookmarkMg</a>。可按关键词和标签筛选。</p><ul><li><strong>智能打标签：</strong>根据书签名称、描述和可用网页内容推荐标签，复审后才应用。</li><li><strong>网页存档：</strong>免费抓取并保存完整正文；AI 摘要需要在存档中另行明确生成并消耗额度。</li><li><strong>AI 分析：</strong>从当前书签卡片分析该网页，或根据当前书签生成新笔记。</li><li><strong>链接体检：</strong>区分正常、疑似失效和无法判断；超时、反爬、需登录不会被武断判死链。</li><li>支持置顶排序、导入导出、批量标签和移入回收站。</li></ul>';
UPDATE knowledge_base SET title = @bookmark_management_title, content = @bookmark_management_content, updated_by = NULL WHERE id = @bookmark_management_id;

SET @bookmark_snapshot_id = '2308c270-7ed0-117e-80f0-dfa644922619';
SET @bookmark_snapshot_content = '# 网页存档、AI 摘要与防死链\n\n网页存档和 AI 摘要是两个清楚分开的动作。\n\n## 免费的网页存档\n- 在新增或编辑书签时启用“保存网页存档”，或在书签卡片上生成/更新网页存档。\n- 它只抓取并保存当时可读取的网页正文，不调用模型、不消耗 AI 额度。\n- 更新正文会使旧摘要失效，但不会自动生成新摘要。\n\n## 消耗额度的 AI 摘要\n- 已经有网页正文后，由用户明确点击“生成 AI 摘要”。\n- 摘要按本次真实模型 token 计入统一 AI 额度；已有摘要在不要求重新生成时可直接读取缓存。\n\n需要登录使用；需登录访问、强反爬或纯前端渲染的网站可能无法保存正文。抓取失败不会覆盖已有的成功存档。';
UPDATE knowledge_base SET content = @bookmark_snapshot_content, updated_by = NULL WHERE id = @bookmark_snapshot_id;

SET @bookmark_validation_id = '7fc948ab-311c-4b0d-aa79-1978876eb973';
UPDATE knowledge_base
SET content = REPLACE(content, '选择候选本身不会立即保存；在轻笺智域中还会继续展示最终写入确认。', '选择候选本身不会立即保存；确认表单内容并点击保存后才会创建书签。'),
    updated_by = NULL
WHERE id = @bookmark_validation_id;

SET @smart_tags_id = '230bf6c0-7ed0-117e-8a12-c9dc04f3e8e7';
SET @smart_tags_title = '智能打标签（批量推荐标签）';
SET @smart_tags_content = '# 智能打标签\n\n“智能打标签”只负责为书签或笔记推荐标签，不会改写正文，也不是通用内容整理。\n\n## 怎么用\n- 在书签管理或笔记库进入智能打标签。\n- 普通状态处理当前筛选范围；批量状态只处理明确选中的条目。\n- 书签依据名称、描述和可用网页内容推荐标签；笔记依据标题和正文推荐标签。\n- 优先复用已有标签，结果会先展示供复审，确认后才应用。\n\n所有真实模型调用计入统一 AI 额度；可从设置中的“AI 用量与计费规则”进入独立页面查看用量。';
UPDATE knowledge_base SET title = @smart_tags_title, content = @smart_tags_content, updated_by = NULL WHERE id = @smart_tags_id;

-- 资源中心、待办与来源跳转。
SET @resource_center_id = '5037bdde-08e0-42b3-a212-4dc80ac3ff8a';
SET @resource_center_content = '<h2>统一搜索</h2><p>地址为 <a href="https://boluo66.top/search">/search</a>，电脑端不在编辑区域时按 <code>/</code> 可聚焦全局搜索。它统一查找当前账号的书签、笔记、云文件、待办和标签，不是公网搜索引擎。</p><h2>AI 分析</h2><p>选择一项资料后，右侧详情卡提供“AI 分析”；批量选择时可总结所选，选择至少两项时可比较。分析严格限制在当前明确选择的资源，点击其他卡片会切换当前对象，不会沿用上一项结果。不同资源类型只在存在可靠可读内容时参与分析。</p><h2>批量与权限</h2><p>批量标签页 <code>/search/batch-tags</code> 可给选中的跨资源结果统一新增、移除或替换标签。所有搜索、详情和分析只返回当前账号有权访问的内容。</p>';
UPDATE knowledge_base SET content = @resource_center_content, updated_by = NULL WHERE id = @resource_center_id;

SET @todo_detail_id = '5fa7cc32-fa07-4e50-9918-ab4ac59dbe6a';
SET @todo_ai_marker = 'data-ln-feature="todo-module-ai-v1"';
SET @todo_ai_section = '<section data-ln-feature="todo-module-ai-v1"><h2>拆解待办</h2><p>编辑待办时，“AI 拆解”会完整读取当前标题、说明和已有清单，再生成可检查的清单草稿。简洁模式生成 3～5 步，详细模式生成 6～10 步；不会加入目标和说明之外的工作。草稿不会自动修改待办，只有点击“确认应用清单”后才写回当前表单。</p></section>';
UPDATE knowledge_base
SET content = CASE
      WHEN LOCATE(@todo_ai_marker, COALESCE(content, '')) = 0 THEN CONCAT(COALESCE(content, ''), @todo_ai_section)
      ELSE content
    END,
    updated_by = NULL
WHERE id = @todo_detail_id;

SET @source_links_id = 'c304a995-a759-4324-947d-bca092766750';
SET @source_links_content = '<p>模块 AI 的结果如果使用了来源，会在结果下方展示可点击的来源：笔记进入对应笔记；书签优先打开原网页，原链接失效且存在网页存档时可查看存档；云文件按文件 ID 预览；帮助文章在轻笺内打开；待办进入详情。来源缺少稳定 ID、已删除、无权限或已过期时保持只读，不会猜测跳到其他资源。相同资源重复参与证据时，界面按稳定资源 ID 去重展示。</p>';
UPDATE knowledge_base SET content = @source_links_content, updated_by = NULL WHERE id = @source_links_id;

-- 帮助中心自己的只读问答说明。
SET @help_ai_id = '59db6e38-5469-4ee3-94ea-a15b6e92d286';
SET @help_ai_title = '问问轻笺助手：回答范围、来源与隐私边界';
SET @help_ai_content = '<h1>问问轻笺助手</h1><p>帮助中心的“问问轻笺助手”只回答轻笺产品怎么使用。输入问题后，它会检索当前公开帮助文章，并在回答中标注来源。</p><h2>不会读取什么</h2><p>它不会读取或推测你的笔记、书签、文件、待办、账号数据、管理知识或互联网内容，也不能创建、修改或删除任何数据。</p><h2>没有可靠资料时</h2><p>没有找到足以支持答案的公开说明时，会直接提示暂未找到可靠说明，并引导查看全部帮助或提交反馈，不会编造产品能力。</p><h2>连续追问</h2><p>同一帮助问题可保留少量连续追问用于理解“第二点”“再解释一下”等省略表达；回答事实仍需来自本轮重新检索到的公开文章。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by, admin_archived)
SELECT
  @help_ai_id, @help_ai_title, @help_ai_content,
  '帮助中心', 'public', 'html', 947, NULL, NULL, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @help_ai_id)
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_base WHERE title = @help_ai_title AND COALESCE(admin_archived, 0) = 0
  );

SET @help_ai_target_id = COALESCE(
  (SELECT id FROM knowledge_base WHERE id = @help_ai_id LIMIT 1),
  (SELECT id FROM knowledge_base WHERE title = @help_ai_title AND COALESCE(admin_archived, 0) = 0 ORDER BY id LIMIT 1)
);

UPDATE knowledge_base
SET title = @help_ai_title,
    content = @help_ai_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 947,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @help_ai_target_id;

-- 已经不存在的全屏助手、确认卡、附件会话和自由引用资料说明改为可恢复归档。
UPDATE knowledge_base
SET status = 'internal', admin_archived = 1, updated_by = NULL
WHERE id IN (
  'de09dedf-e0d4-43d1-a80d-12986461c875',
  '4d3558be-d784-4d4c-8772-5cc690ce07fa',
  '95b7a657-9415-4a05-a899-8d5a033caa4f',
  '93aa8c5e-26ae-4201-8fa6-1701e47783ee',
  '82c256c3-a44c-4699-8d23-00b352e8ba0c',
  'ba1debba-8017-4922-bc90-0207593af5b7',
  '20bc9db9-5663-410b-a1df-a20c3b780e3a'
);

COMMIT;

SELECT id, title, category, status, type, sort, admin_archived, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (
  @module_ai_id,
  @ai_quota_id,
  @mobile_nav_id,
  @mobile_difference_id,
  @mobile_guide_id,
  @overview_id,
  @note_management_id,
  @note_ai_short_id,
  @note_ai_guide_id,
  @file_ai_id,
  @bookmark_management_id,
  @bookmark_snapshot_id,
  @smart_tags_id,
  @resource_center_id,
  @todo_detail_id,
  @source_links_id,
  @help_ai_target_id
)
ORDER BY sort DESC, title;
