-- Explicit help synchronization; requires help_section migration. No automatic production execution.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @todo_workspace_help_id = 'a6145750-8e78-48c0-8ed7-68fb5b977007';
SET @todo_workspace_help_title = '待办工作区：清单、标签与子事项';
SET @todo_workspace_help_content = '<h1>待办工作区：清单、标签与子事项</h1><p>列表与议程可从左侧切换所有任务、今天、本周、重要、任务清单和未归类。日历与四象限跨清单展示，返回列表或议程会恢复原范围。每条待办最多属于一个清单；删除清单只解除归属，待办、完成状态和提醒都会保留。手机在列表与议程使用“选择任务范围”打开范围抽屉。</p><h2>清单与标签</h2><p>编辑待办或使用行内更多菜单，可以移动所属清单、关联多个全站标签。清单内新建会带入当前清单。标签详情的“待办”页签可查看未完成、已完成和全部任务；资料总数仍只统计书签、笔记和文件。全局搜索可命中待办标题、说明和标签名称。待办筛选同时包含所选标签，全局搜索沿用任一标签组合规则。</p><h2>列表与统计</h2><p>概览统计所有未完成任务；左侧数字跟随当前视图的有效状态，状态页签数字统计当前范围和筛选。今天、本周按截止日期判断，本周从周一到周日；重要指高优先级。已排期表示有开始、截止或实例日期。默认列表先显示待处理重点，其余按清单分组；最近完成仅作折叠预览。</p><h2>子事项</h2><p>子事项是父待办内的检查项，不是独立任务。点击进度按钮展开，超过五项可继续查看其余内容。父待办和子事项独立完成，父已完成后不能编辑子事项。保存失败时保留原勾选状态，可在行内重试。日历与四象限提供进度摘要，点击任务进入详情处理。</p><h2>普通与高级</h2><p>普通待办可以不设日期，也可以重复提醒同一条任务。高级功能会每次生成独立待办，分别完成。两种模式分别保留时间和提醒草稿，共享标题、说明、子事项、关联资料、清单和标签。</p><p>高级设置中的首次安排日期、停止条件、每次开始与截止时刻是独立设置；时刻可不填，不会自动补成23:59。普通截止日期也不作为计划结束日期。修改计划后需等待最新预览通过再保存。关闭有修改的表单会询问是否放弃。</p><h2>系列归属</h2><p>仅修改清单或标签时，可选择仅本次、当前及以后或整个系列。后两项调整相应未完成实例与后续模板，已完成记录保持原归属。只改归属不重建任务或提醒。</p>';
INSERT INTO knowledge_base (id,title,content,category,help_section,status,type,sort) SELECT @todo_workspace_help_id,@todo_workspace_help_title,@todo_workspace_help_content,'帮助中心','待办与提醒','public','html',924 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id=@todo_workspace_help_id OR title=@todo_workspace_help_title);
SET @todo_workspace_help_target = COALESCE((SELECT id FROM knowledge_base WHERE id=@todo_workspace_help_id LIMIT 1),(SELECT id FROM knowledge_base WHERE title=@todo_workspace_help_title ORDER BY id LIMIT 1));
UPDATE knowledge_base SET content=@todo_workspace_help_content,help_section='待办与提醒',category='帮助中心',status='public',type='html' WHERE id=@todo_workspace_help_target;
UPDATE knowledge_base SET content=REPLACE(content,'<p>待办是行动对象，不纳入标签的书签、笔记和文件聚合。</p>','<p>待办在独立“待办”页签查看，可切换未完成、已完成和全部。目录另列待办数量；资料总数、相关标签、图谱和标签 AI 仍只处理书签、笔记、文件。编辑资料关联不会清空待办关联，删除标签不删除待办。</p>'),help_section='收集与整理' WHERE id='e39f1fd9-bb2a-4b52-b916-548cf72fc10c' OR title='标签如何使用';
UPDATE knowledge_base SET content=REPLACE(REPLACE(REPLACE(content,'待办清单','子事项'),'清单内容','子事项内容'),'详情里的清单','详情里的子事项'),help_section='待办与提醒' WHERE id='5fa7cc32-fa07-4e50-9918-ab4ac59dbe6a';
COMMIT;
