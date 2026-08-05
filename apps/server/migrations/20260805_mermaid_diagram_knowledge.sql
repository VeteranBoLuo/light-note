-- 2026-08-05 轻笺笔记图表（mermaid）帮助文档（MySQL 5.7 兼容）
-- 这是线上业务数据写入脚本，不随结构迁移或部署脚本自动执行。
-- 执行后需要重启 app 让知识库缓存失效（knowledgeService 有 5 分钟缓存）。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @diagram_id = 'c1f4a7d2-5b83-4e16-9a7c-2d0f6b8e4351';
SET @diagram_title = '笔记图表：思维导图、流程图与时序图（mermaid）';
SET @diagram_content = '<h2>在笔记里画图</h2><p>轻笺的 Markdown 笔记和富文本笔记都支持 mermaid 图表，可以画思维导图、流程图、时序图和时间线。图表跟随深浅主题，点右上角「放大查看」可以放大和拖动。</p><h3>怎么插入</h3><p>Markdown 模式：点编辑器右上角的「插入图表」，选择图表类型，会插入一段可直接编辑的模板代码，预览区实时出图。也可以手写：用三个反引号加 <code>mermaid</code> 开启代码块。</p><p>富文本模式：点工具栏的图表按钮选择类型。富文本里会同时显示图表源码和渲染出的图，源码可以直接改，改完图会跟着更新；分享和只读查看时只显示图。</p><h3>思维导图写法</h3><p>第一行写 <code>mindmap</code>，之后用缩进表示层级，缩进多的是下一级节点。根节点写成 <code>root(主题)</code> 会显示成圆角方块，写成 <code>root((主题))</code> 是圆形（圆形放中文容易顶到边缘，建议用圆角方块）。例如：<code>mindmap</code> 换行 <code>  root(核心主题)</code> 换行 <code>    分支一</code> 换行 <code>      要点 A</code>。</p><h3>其他图表</h3><p>流程图第一行写 <code>flowchart TD</code>（TD 表示从上到下，LR 表示从左到右），节点之间用 <code>--&gt;</code> 连接，判断分支写成 <code>B --&gt;|是| C</code>。时序图第一行写 <code>sequenceDiagram</code>，用 <code>A-&gt;&gt;B: 消息</code> 表示调用、<code>B--&gt;&gt;A: 返回</code> 表示应答。时间线第一行写 <code>timeline</code>。</p><h3>注意</h3><p>mermaid 的注释是 <code>%%</code> 开头，不是 HTML 注释。图表语法写错时不会影响笔记其他内容，会在图表位置提示语法错误并保留原始代码，改对了就会重新出图。导出 PDF、导出 HTML 和分享链接里的图表都会保留成图片。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @diagram_id, @diagram_title, @diagram_content,
  '帮助中心', 'public', 'html', 97, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @diagram_title)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @diagram_id);

UPDATE knowledge_base
SET content = @diagram_content, category = '帮助中心', status = 'public', type = 'html', sort = 97, updated_by = NULL
WHERE id = @diagram_id OR title = @diagram_title;

COMMIT;

SELECT id, title, category, status, type, sort
FROM knowledge_base
WHERE id = @diagram_id OR title = @diagram_title;
