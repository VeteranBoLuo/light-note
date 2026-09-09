-- Optional idempotent help update after the progress UI is available. No note/task data changes.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
UPDATE knowledge_base
SET content=CONCAT(COALESCE(content,''),'<section data-help-note-import-progress-v1="true"><h2>查看导入进度与结果</h2><p>选择文件后显示上传与解析进度，检查内容并确认后进入后台执行页，可查看当前文件、图片处理数量和笔记写入阶段。关闭窗口后任务继续，重新从导入任务进入可查看最新进度。历史任务按状态提供继续检查、查看进度或查看结果；部分失败只需重试失败项，成功笔记不会重复创建。</p><p>结果页可打开已导入笔记。网页排版简化与图片资源问题分别展示，展开内容提示可查看原因。外链图片保留原链接，未保存到轻笺。旧记录可能只有历史解析提示，不能据此判断当前笔记缺图。</p></section>')
WHERE title='笔记管理' AND LOCATE('data-help-note-import-progress-v1',COALESCE(content,''))=0;
