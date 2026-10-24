-- Explicit, idempotent help migration. Run only with publication authorization.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @public_resource_help_id = '15b1f0d2-ea8a-4ef5-904c-fad4c9d6b801';
SET @public_resource_help_title = '全站搜索与公开资源';
SET @public_resource_help_content = '<h2>搜索全站公开资源</h2><p>登录后在资源中心、电脑顶栏或手机快捷搜索中开启“包含全站公开资源”，即可在原有结果中查找其他用户已审核通过的书签和纯文字笔记。公开条目标明“站内公开”和作者，自己的资源继续保持原有排序和操作。开关首次关闭，仅在手动切换时按账号保存在当前浏览器或 App，刷新和重新登录恢复上次选择；切号恢复对应账号自己的选择，游客和管理员代管不读取或改写本人偏好。标签、无标签和待办筛选仅作用于自己的资源，公开资源按公开版更新时间筛选。</p><h2>公开自己的资源</h2><p>从资源中心进入“公开管理”，选择书签或纯文字笔记，预览完整公开材料并确认后提交。含图片、媒体或画板的笔记暂不支持；仅公开当前页文字，不公开原目录、私人标签、附件和内部链接目标。书签只检查标题、网址和说明，外链目标未核验。提交后经过内容审核，通过后才展示。</p><h2>批量提交与撤回</h2><p>未公开资源与已有发布在同一列表，勾选框始终显示，点击资源行只切换预览，勾选框用于选择或取消；勾选时同时预览对应资源。手机在当前工作区预览所选材料，从统一操作栏进入提交确认或取消公开。即时预览不代表同意公开，提交前仍需确认完整内容。单次最多 100 项，列表滚动加载，筛选后保留已选项，全选只作用于明确标注的范围；范围超过上限时明确选择前 100 项，不隐含公开整库。逐项预览完整公开内容，含媒体等不支持项会明确说明；确认可提交范围后再提交审核。所选中有公开版或待审版的资源可取消公开，确认时列明实际处理目标，其他所选项不受影响；撤回同时停止展示旧公开版并取消待审提交。</p><p>结果逐项显示，较多资源会顺序排队，可停止剩余处理，已成功项保留。提交失败需要重新预览确认，撤回失败需要刷新状态并再次确认；成功项不会重复处理。请求结果不明确时先“确认结果”，仍未查到可重试本次操作。可随时清空选择，切换账号或离开页面也会结束本次选择。</p><p>公开版与原稿独立。内容未变化时不会重新送审，也不会更新提交记录时间；修改原稿并保存后，需重新预览并提交；更新等待审核或未通过时，旧公开版仍可见。撤回或删除原稿立即停止后续公开读取，恢复原稿不会恢复公开，需要主动重新提交。被下架的资源须解除下架后才能重新提交。</p><h2>阅读、保存与举报</h2><p>公开详情为登录后只读展示，可保存为自己的副本或举报。新副本保留原作者和公开条目来源链接，书签目标网址与来源链接分别展示。重复保存同一笔记修订不会重复创建；书签已有同网址时提供打开入口，不覆盖自己的标题和说明，回收站副本需先恢复。作者更新或撤回不会改动已保存副本，也无法抹去他人已经阅读或复制的内容。审核结果只进入站内通知铃铛。</p>';
INSERT INTO knowledge_base (id,title,content,category,help_section,status,type,sort,created_by,updated_by)
SELECT @public_resource_help_id,@public_resource_help_title,@public_resource_help_content,'帮助中心','收集与整理','public','html',90,NULL,NULL
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE BINARY id=BINARY @public_resource_help_id);
UPDATE knowledge_base SET content=@public_resource_help_content,category='帮助中心',help_section='收集与整理',status='public',type='html',updated_by=NULL
WHERE BINARY id=BINARY @public_resource_help_id;
COMMIT;
