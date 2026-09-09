-- Explicit, idempotent help copy update; no task or note data changes.
UPDATE knowledge_base
SET content=REPLACE(REPLACE(content,
  '在笔记库的“更多”中选择“导入笔记”或“导入记录”；手机端使用“笔记操作”菜单。',
  '在笔记库的“更多”中选择“导入笔记”；手机端使用“笔记操作”菜单。导入窗口右上角的“导入任务”可查看历史与未完成任务。'),
  '导入记录可查看逐篇结果、停止剩余任务、继续及重试。已成功笔记保留。',
  '导入任务可查看逐篇结果、停止剩余任务、继续及重试。上传未完成时可重新选择文件或放弃；过期后需重新导入。任务停止后可移除记录，已导入笔记不会删除。')
WHERE title='笔记管理' AND LOCATE('data-help-note-transfer-v1',COALESCE(content,''))>0;
