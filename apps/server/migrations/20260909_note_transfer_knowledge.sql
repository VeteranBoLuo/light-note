-- Apply separately after the note transfer feature is available. No runtime knowledge writes.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @transfer_marker = 'data-help-note-transfer-v1';
SET @transfer_section = '<section data-help-note-transfer-v1="true"><h2>批量导入笔记</h2><p>在笔记库的“更多”中选择“导入笔记”或“导入记录”；手机端使用“笔记操作”菜单。页面目录菜单提供“导入到此页面”。支持 Markdown、HTML、Word DOCX 和 ZIP，最多 200 篇、100MB。上传完成前保持页面打开；解析后检查标题、图片提示和导入位置，再确认后台导入。每个文档生成一篇新笔记，不覆盖同名内容，不恢复目录或双链。包内图片会归档，远程图片保留链接。Word 复杂排版可能简化。</p><p>导入记录可查看逐篇结果、停止剩余任务、继续及重试。已成功笔记保留。导入公开分享目录需确认，权限或目标变化会暂停。未确认任务保留 24 小时，完成后的暂存文件保留 7 天，记录保留 30 天。</p><h2>导出页面与子页面</h2><p>目录菜单选择“导出”，可以只导出当前页面，或包含全部层级子页面。展开状态和筛选不会缩小导出范围。子页面导出为保留层级的 ZIP，父页面正文和同名目录并存。可选择原格式、Markdown、HTML、PDF；手绘仅在原格式下导出 JSON。图片保留原链接，生成期间需保持页面打开。超出单次限制时请选择较小范围。</p></section>';
UPDATE knowledge_base SET content=CONCAT(COALESCE(content,''),@transfer_section),updated_by=NULL
WHERE title='笔记管理' AND LOCATE(@transfer_marker,COALESCE(content,''))=0;
COMMIT;
