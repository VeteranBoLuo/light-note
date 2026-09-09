-- Idempotent help update only; no user notes or import tasks are changed.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
UPDATE knowledge_base
SET content=CONCAT(COALESCE(content,''),'<section data-help-note-import-cleanup-v1="true"><h2>导入任务与文件保留</h2><p>导入使用同一抽屉展示新建、任务列表和详情。顶部返回恢复上一层及原有输入，关闭退出整个导入抽屉；新建导入开始新流程。手机系统返回先退回上一层。</p><p>导入任务列表可清空已完成、失败和过期记录。待确认、暂停和执行中的任务保留，活动租约中的任务不会清空。清空后不能再重试，已导入笔记及其图片不受影响。单条未完成任务可通过详情底部的“放弃任务”按钮放弃。</p><p>确认导入前，临时文件保留至任务创建后24小时；确认导入、重试和执行结束时，保留期重置为7天。到期文件由后台清理，执行中的任务不会因到期被删除。移除记录后临时文件进入清理队列，清理可能因后台忙碌而延迟。</p></section>')
WHERE title='笔记管理' AND LOCATE('data-help-note-import-cleanup-v1',COALESCE(content,''))=0;
