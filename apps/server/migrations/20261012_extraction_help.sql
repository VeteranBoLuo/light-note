-- Explicit help content migration; apply with feature publication authorization.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @extraction_help_id = 'b8e472d0-4b2d-47a4-8a90-d0838ca95d68';
SET @extraction_help_title = '资料转表格：AI 提取与人工核对';
SET @extraction_help_content = '<h2>资料转表格</h2><p>从知识工坊打开“资料转表格”，或在资料库明确勾选资料后通过“生成与处理”进入。选资料、AI 建议字段、样例确认、全文提取、人工核对和导出都在一个工作台内完成。功能未开放时入口隐藏，已有提取表仍可查看、核对和导出。</p><p>选好资料并可选填写目标后，点击“开始分析”，后台会依次检查、建议字段并生成样例，不必自己预填字段或在检查后再次点击。类型由 AI 建议，在高级规则中可调整类型、记录定义与提取说明。不可读或部分读取时先处理或确认，再继续分析。建议和样例只使用第一份资料的首个处理范围，确认后才提取全部可读取范围。更改规则、类型或顺序会使旧样例失效，可先刷新样例再确认；全文提取开始后结构锁定。</p><p>本地上传文件保存到云空间并占用容量；取消提取或删除提取表不会删除文件。支持文字笔记、已有正文存档的书签及 TXT、Markdown、CSV、PDF、DOCX、PNG、JPG、WebP；手绘笔记、无正文书签和不可解析文件提示原因，部分读取须明确确认。</p><p>只有 AI 建议、样例和提取消耗 AI 额度，按实际成功交付的用量结算；结构或依据校验最多修复一次，修复费用由平台承担，失败不扣用户额度。检查资料、本地 OCR、核对、恢复、筛选、排序与导出免费。暂停会等待当前处理保存，关闭页面不会取消后台任务。额度不足需补足后明确继续，结果不确定的调用不会自动重发。完整临时材料保留 24 小时，过期后未处理部分需新建提取，已有结果和依据继续保留。</p><p>点击单元格或手机记录查看原值、当前值、原文依据和覆盖限制。人工清空是有效修正，可恢复原值；排除记录可恢复。字段分歧和依据不完整需要人工核对。原资料变化或删除不改写已有结果。</p><p>导出明确选择全部有效记录或完整筛选范围，不局限当前一页。Excel 附带依据与核对、处理说明；数据摘要可存为笔记，笔记与提取表不自动同步。最近提取表在工作台内打开，账号数据导出可选择提取表。删除表前先结束活动任务；原文件和已保存笔记保留。</p>';
INSERT INTO knowledge_base (id,title,content,category,help_section,status,type,sort,created_by,updated_by)
SELECT @extraction_help_id,@extraction_help_title,@extraction_help_content,'帮助中心','AI 与权益','public','html',98,NULL,NULL
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id=@extraction_help_id OR title=@extraction_help_title);
UPDATE knowledge_base SET content=@extraction_help_content,category='帮助中心',help_section='AI 与权益',status='public',type='html',updated_by=NULL
WHERE id=@extraction_help_id OR title=@extraction_help_title;
COMMIT;
