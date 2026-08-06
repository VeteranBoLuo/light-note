-- 2026-08-06 笔记页面树、AI 目录范围与批量整理帮助文档（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。
-- 页面树数据库结构由 20260806_note_page_tree.sql 管理，本文件不得混入 Schema DDL。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

-- 1) 新增页面树专页：覆盖桌面、移动端、移动/删除/恢复，以及正文大纲的概念边界。
SET @page_tree_help_id = '50e9ca70-96f8-4db1-84fb-fb845d25e7c8';
SET @page_tree_help_title = '笔记页面树：父页面、子页面、移动目录与手机抽屉';
SET @page_tree_help_content = '<h1>用页面树组织笔记</h1><p>轻笺的每一项目录仍然是一篇可以编辑正文、加标签和交给 AI 的笔记，不会另外创建空文件夹。把一篇笔记放到另一篇下面，它就成为子页面；移动父页面时，下面的全部子页面会一起移动。</p><h2>电脑端：目录树、卡片和列表同时工作</h2><p>笔记库左侧的「目录」展示页面树，点整行会进入该目录，右侧继续用卡片或列表展示它的直接子页面。箭头只负责展开和收起下一层。顶部面包屑显示当前位置；搜索会限定在当前目录及其子页面，并显示完整路径，方便区分同名页面。目录和标签是两套独立分类入口，不叠加过滤；切到标签只按标签筛选，切回目录只按页面树范围浏览。设置中心还可以选择笔记库默认打开目录或标签。</p><h2>父页面也有正文</h2><p>目录里的父页面不是空壳。可以从笔记库点「打开正文」，或直接打开任一父页面，像普通笔记一样编辑富文本或 Markdown、使用标签和 AI。正文底部会列出直接子页面，并提供「添加已有子页面」「移动此页到…」和新建子页面：前者把其他页面移动到当前页下，后者把当前页移动到另一页面下；正文、标签和原有子树都保持不变。</p><h2>手机和 APK：目录放在底部抽屉</h2><p>移动端不会常驻显示整棵树。工具栏只保留一个当前范围按钮，点开后从底部抽屉选择目录或标签：点整行选择当前目录并关闭，点右侧箭头进入下一层，顶部返回按钮回到父层。范围按钮只显示当前启用的目录或标签分类。空目录会明确提示当前笔记没有子页面，并提供新建子页面和添加已有子页面。Android、鸿蒙兼容模式和其他系统 WebView 中，当前项仍会用实色描边、文字色和字重显示，不依赖混色阴影。</p><h2>移动页面与层级限制</h2><p>从单篇菜单或批量操作选择「移动」后，可以把页面放到根层或其他父页面。电脑端也可拖动页面：卡片、列表或目录树节点靠近上沿/下沿时，目标列表会动画让位并显示实色插入线，松开后插到同层页面前面/后面；落在页面中央则把它变成该页面的子页面。拖到「我的知识库」会移动到根层同置顶分组最前，置顶页面与普通页面不会互相穿插。目录树节点既可拖动，也可和面包屑一起作为落点。系统会阻止移动到自己、自己的后代、其他账号页面，页面树最多 8 层；超过上限时不会写入。移动只改变页面所在位置，不会修改正文历史、标签或反向链接。</p><h2>删除、回收站与恢复</h2><p>有子页面的父页面需要按整棵子树确认删除，系统会显示实际影响数量。一次删除的父子页面会作为同一批进入回收站并可成组恢复；更早单独删除的子页面不会被误恢复。彻底删除父页面时，同批子树也会一起清理。</p><h2>页面目录与正文大纲不是同一个功能</h2><p>「页面目录」表示笔记之间的父子关系；详情页的「正文大纲」只读取当前这篇笔记里的 H1/H2/H3 标题，用来跳转章节。两者互不转换，也不会因为移动页面而改写正文标题。</p>';
SET @page_tree_help_content = REPLACE(@page_tree_help_content, '拖到「我的知识库」会移动到根层同置顶分组最前，置顶页面与普通页面不会互相穿插。', '拖到「我的知识库」会移动到根层同置顶分组最前。如果拖到另一置顶分组节点的上沿或下沿，被拖页面会跟随目标自动置顶或取消置顶，可以直接移到第一个置顶页面前。');
SET @page_tree_help_content = REPLACE(@page_tree_help_content, '落在页面中央则把它变成该页面的子页面。', '落在页面中央则把它变成该页面的子页面；原来置顶的页面会同时取消旧父层的置顶，拖拽提示会在松手前说明。');
SET @page_tree_help_content = REPLACE(@page_tree_help_content, '松开后插到同层页面前面/后面；', '松手后界面会立即更新到新位置，保存失败才恢复原位置；');
SET @page_tree_help_content = REPLACE(@page_tree_help_content, '目录树节点既可拖动，也可和面包屑一起作为落点。', '目录树节点既可拖动，也可和面包屑一起作为落点；节点菜单还提供置顶和取消置顶。');

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @page_tree_help_id, @page_tree_help_title, @page_tree_help_content,
  '帮助中心', 'public', 'html', 98, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @page_tree_help_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @page_tree_help_id);

UPDATE knowledge_base
SET title = @page_tree_help_title,
    content = @page_tree_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 98,
    updated_by = NULL
WHERE id = @page_tree_help_id OR title = @page_tree_help_title;

-- 2) 更新既有《笔记管理》总览，避免继续把笔记库描述成只有平铺列表。
SET @note_guide_id = '808f738e-3d5c-11f1-b2ac-fa163e50acdb';
SET @note_guide_title = '笔记管理';
SET @note_guide_content = '<h1>笔记管理</h1><p>笔记库用于创建和整理 HTML 富文本或 Markdown 笔记。现在可以用页面树把相关笔记放在父页面与子页面下，同时继续使用标签、卡片、列表和搜索。访问地址：<a href="/noteLibrary">/noteLibrary</a>。</p><h2>页面树、标签与搜索</h2><ul><li>页面树回答「这篇笔记放在哪里」；标签回答「它属于哪些跨目录主题」。它们是两套独立分类入口，切换时不会叠加过滤。</li><li>父页面本身可以编辑正文，右侧只展示当前层的直接子页面；面包屑用于返回上级。</li><li>当前目录内搜索会覆盖全部后代并显示路径，同名笔记也能区分。</li></ul><h2>卡片、列表与排序</h2><p>卡片、列表和左侧目录树都支持拖动：靠近项目上沿/下沿时，目标列表会动画让位并显示插入线，可调整同一父层、同一置顶分组内的前后顺序；松开在项目中央会立即把页面归入该父页面。拖到「我的知识库」会放到根层同置顶分组最前。置顶页面始终位于普通页面之前。</p><h2>批量整理</h2><p>进入批量模式后，可以批量移动到某个目录、关联或移除标签、移入回收站。「添加到 AI 助手」会把所选笔记作为本轮问答材料；「AI 智能整理」专门为所选笔记推荐并应用标签，两者不会混用。</p><h2>新建、编辑与模板</h2><p>可以在根层新建页面，也可以在当前目录或父页面详情底部新建子页面；「添加已有子页面」会把其他页面移动到当前页下，「移动此页到…」会把当前页移动到另一页面下。新建笔记支持空白 HTML、空白 Markdown、内置模板和自己的模板。详情页仍可使用正文大纲跳转当前笔记的 H1/H2/H3；正文大纲不是页面树。</p><h2>手机和 APK</h2><p>移动端只保留一个当前范围按钮，点开底部抽屉即可在目录和标签之间切换；范围按钮只显示当前启用的分类，卡片与列表仍可切换。空目录会直接提供新建子页面和添加已有子页面。系统 WebView 的兼容样式会保留当前项实色状态。</p><h2>删除与恢复</h2><p>删除有子页面的父页面时会显示整棵子树数量并成批进入回收站；同一批父子页面可一起恢复。彻底删除会清理同批子树，但不会误恢复更早单独删除的页面。</p>';
SET @note_guide_content = REPLACE(@note_guide_content, '可调整同一父层、同一置顶分组内的前后顺序', '可调整同一父层的前后顺序；跨过置顶分界时会跟随目标自动置顶或取消置顶');
SET @note_guide_content = REPLACE(@note_guide_content, '松开在项目中央会立即把页面归入该父页面。', '松开在项目中央会立即把页面归入该父页面；如果原页面已置顶，会同时取消旧父层的置顶，不需要先手工解除。');
SET @note_guide_content = REPLACE(@note_guide_content, '卡片、列表和左侧目录树都支持拖动：', '卡片、列表和左侧目录树都支持拖动，松手后界面立即更新，保存失败才恢复原位置：');
SET @note_guide_content = REPLACE(@note_guide_content, '置顶页面始终位于普通页面之前。', '置顶页面始终位于普通页面之前，目录节点菜单可直接置顶或取消置顶。');

UPDATE knowledge_base
SET title = @note_guide_title,
    content = @note_guide_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    updated_by = NULL
WHERE id = @note_guide_id OR title = @note_guide_title;

-- 3) 更新既有 AI 作用范围说明：单篇材料与目录范围是独立协议，覆盖数字必须诚实。
SET @ai_scope_help_id = 'b14e9846-ad31-4cd2-a75f-b88b132ac286';
SET @ai_scope_help_title = '轻笺智域的作用范围与依据边界';
SET @ai_scope_help_content = '<h1>轻笺智域的作用范围与依据边界</h1><p>轻笺智域可以检索当前账号有权访问的笔记、书签和云文件，也可以读取你在输入区明确添加的资源或上传文件，用于摘要、问答和整理。回答只会展示实际使用的来源；没有账号内依据时会明确说明未找到。</p><h2>引用单篇笔记与选择目录范围</h2><p>搜索一篇笔记时会出现两种结果：「笔记」只引用这一篇；「目录范围」以它为根，包含当前页面和全部子页面。客户端只提交目录根 ID，标题、后代列表、正文和缓存页面树都不会作为权限依据；服务端会按当前账号和最新页面树重新校验。目录被删除、引用过期或属于其他账号时会失败关闭，不会退化成全库检索。</p><h2>目录内普通问答</h2><p>例如在「轻笺项目」目录里问「移动端全局搜索的结论是什么」，AI 只会在该子树检索最相关片段，不需要读取全部页面。回答下方会显示目录总页数和本回答实际引用的页数；「目录共 18 页、引用 4 页」不表示其余 14 页已经读过。</p><h2>完整目录分析</h2><p>明确要求「总结这里所有模块、重复决策、冲突和未完成事项」时，会进入目录分析：分批读取页面、逐页形成结构化摘要，再合并主题、重复、冲突与待办。回答会显示分析范围、页面总数、已完整覆盖和未读取数量。同步分析上限为 30 个页面或 120,000 个可读字符；超过上限会要求缩小范围，不会把截断结果冒充完整分析。Provider 只有部分批次成功时也会按实际页面披露覆盖。</p><h2>续问与材料消费</h2><p>目录范围与普通材料默认只作用于当前提问；如果下一句话在语义上明显承接上轮，系统可以继续沿用稳定的 type/ID 引用，并再次按账号归属解析。切换话题或手动移除后不会继承。</p><h2>会话与配额</h2><p>会话侧栏支持搜索、置顶、文件夹和归档筛选。配额显示已用百分比和大致可用轮次，Token 明细可展开查看。当前长期记忆关闭，系统不会新增或使用记忆；历史数据导出是独立的数据管理能力。</p>';

UPDATE knowledge_base
SET title = @ai_scope_help_title,
    content = @ai_scope_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    updated_by = NULL
WHERE id = @ai_scope_help_id OR title = @ai_scope_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@page_tree_help_id, @note_guide_id, @ai_scope_help_id);

-- 执行后需重启后端（pm2 restart app）：知识检索有 5 分钟进程内缓存，否则新内容不会立即生效。
