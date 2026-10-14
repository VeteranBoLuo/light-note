-- 知识工坊工具说明；MySQL 5.7 兼容、幂等。与对应功能获授权发布时独立执行。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @workshop_help_id = '04cb4511-eea5-4f89-bd96-ed05e74ecfca';
SET @workshop_help_title = '如何使用知识工坊，以及积分和 AI 额度怎样计算';
SET @workshop_help_legacy_title = '如何使用知识工具箱，以及积分和 AI 额度怎样计算';
SET @workshop_help_content = '<h1>知识工坊</h1>
<p>打开<a href="/toolbox">知识工坊</a>，可以继续处理项目，或选择工具把资料加工成文件和知识成果。每个工具会说明在浏览器内处理还是上传到服务器，以及是否收费。</p>
<h2>免费的浏览器本地工具</h2>
<ul>
<li><strong>PDF：</strong>按当前页面顺序填写范围，例如 1-3, 5，可以批量旋转、删除和导出所选页面，支持撤销最近 20 步编辑。普通文字提取读取文字层，扫描页需要显式启动 OCR。</li>
<li><strong>Word 转 Markdown：</strong>保留标题、表格、编号、嵌套列表和换行。批量处理时单个文件失败不会丢掉成功结果，可以只重试失败文件。支持的内嵌 PNG、JPG、WebP 图片会随 Markdown 打包；不抓取外链图片，不支持或超出限制的图片会提示。复制、翻译和存为笔记只交接文字。</li>
<li><strong>图片处理：</strong>支持 JPG、PNG、WebP 转换、压缩、最长边限制和目标体积预设。为接近目标体积可能降低画质和尺寸，实际输出及未达目标的情况会明确显示；目标体积不是保证值。</li>
<li><strong>表格与数据：</strong>支持粘贴数据、选择文本编码和是否有表头；多工作表 Excel 需选择工作表，取消或失败会保留已有数据。对比显示变更前后值，关键字段需要非空且唯一。表格转换完成后可继续清洗或分析。</li>
</ul>
<p>上述本地处理不会上传原文件或创建云端任务。结果不会自动保存，请在关闭页面前下载；保存到笔记或启动 AI 等后续操作会按界面说明单独执行。</p>
<h2>笔记结构与内容检查</h2>
<p>笔记结构检查是免费的服务器只读检查，可以选择真实目录及其子页面，筛选问题、继续加载并导出检查报告，不修改原笔记。笔记变化后请重新检查，避免混用不同版本的结果。无标签和长期未更新属于可选建议。</p>
<p>AI 内容检查可按报告章节核对。核对标记仅保存在当前浏览器，不代表资料已修改、服务端已修复或已经重新检查；修改原资料后，需要重新选择资料发起检查。</p>
<h2>OCR 与原文件对照</h2>
<p>文档 OCR 的基础识别免费，但有文件、页数及每日用量限制；AI 识别可选择 AI 额度或积分，开始前查看当次提示与报价。两种模式都需要上传文件并在服务器识别，切换方式不会自动开始任务或重复收费。</p>
<p>具有分页信息的识别结果可以选择文件与页码，并重新选择本地原文件对照。对照操作不上传、不重新识别，请自行确认文件版本一致；没有分页信息的历史成果仍可查看完整报告。识别文字应结合原件核对。</p>
<h2>积分和 AI 额度</h2>
<p>一次执行只使用确认时选择的一种结算方式，不会同时扣积分和 AI 额度。积分报价与所选材料绑定，过期或材料变化后需要重新计算；任务会按最终状态结算或释放应退积分。使用 AI 额度时，按实际模型用量计费。PDF 提取文字后的 AI 总结使用 AI 额度，开始前会单独提示。</p>
<p>服务器工具的成果先独立展示，只有明确选择保存到笔记后才创建笔记；重复点击或网络重试沿用保存回执。成果中的覆盖不足、冲突与未知项仍需核对。</p>';
INSERT INTO knowledge_base (id,title,content,category,help_section,status,type,sort,created_by,updated_by)
SELECT @workshop_help_id,@workshop_help_title,@workshop_help_content,'帮助中心','AI 与权益','public','html',98,NULL,NULL
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE id=@workshop_help_id OR title IN (@workshop_help_title,@workshop_help_legacy_title)
);
UPDATE knowledge_base SET title=@workshop_help_title,content=@workshop_help_content,category='帮助中心',
  help_section='AI 与权益',status='public',type='html',sort=98,admin_archived=0,updated_by=NULL
WHERE id=@workshop_help_id OR title IN (@workshop_help_title,@workshop_help_legacy_title);
COMMIT;
