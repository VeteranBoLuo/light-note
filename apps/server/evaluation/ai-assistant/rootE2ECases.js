const readCase = (id, toolName, message, extra = {}) =>
  Object.freeze({ id, toolName, kind: 'read', message, ...extra });

const writeCase = (id, toolName, message, extra = {}) =>
  Object.freeze({ id, toolName, kind: 'write', message, execute: true, ...extra });

/**
 * Root 真实链路矩阵。
 *
 * 这里的文字只包含测试前缀和运行时生成的夹具 ID；Runner 的结果不会保存问题、回答、
 * 标题、资源 ID 或工具参数。顺序是契约的一部分：写工具先建立专属夹具，后续读取、
 * 状态修改、回收站恢复再只作用于这些夹具。
 */
export const ROOT_E2E_TOOL_CASES = Object.freeze([
  writeCase(
    'create-note',
    'create_note',
    '创建一篇标题为“{{NOTE_TITLE}}”、正文为“{{PREFIX}} 短笔记正文”的 Markdown 笔记。',
    {
      after: 'capture_note',
    },
  ),
  readCase('read-note', 'read_note', '精确读取笔记 [note:{{NOTE_ID}}] 的正文并概括。'),
  readCase('query-notes', 'query_notes', '列出我今天新增的笔记数量和标题。', {
    assertion: 'today_note_count',
  }),
  writeCase('create-todo', 'create_todo', '创建一条标题为“{{TODO_TITLE}}”的普通待办，优先级普通。', {
    after: 'capture_todo',
  }),
  readCase('query-todos', 'query_todos', '查询标题包含“{{PREFIX}}”的全部待办。'),
  writeCase('set-todo-status', 'set_todo_status', '把待办 [todo:{{TODO_ID}}] 标记为已完成。'),
  writeCase('delete-todo', 'delete_todo', '删除普通待办 [todo:{{TODO_ID}}]，只删除当前这一条。'),
  readCase(
    'preview-todo-plan',
    'preview_todo_plan',
    '只预览不要创建：为“{{PLAN_TITLE}}”安排每天上午 09:00 重复提醒，从明天开始到后天结束；每天提醒同一条待办，不要每天生成新待办。',
  ),
  writeCase(
    'create-todo-plan',
    'create_todo_plan',
    '创建任务计划“{{PLAN_TITLE}}”：每天上午 09:00 重复提醒，从明天开始到后天结束；每天提醒同一条待办，不要每天生成新待办。',
    { after: 'capture_todo_plan' },
  ),
  writeCase(
    'create-image-note',
    'create_image_note',
    '把本轮上传的图片创建成标题为“{{IMAGE_NOTE_TITLE}}”的图片笔记。[attachment:{{ATTACHMENT_ID}}]',
    { attachment: true },
  ),
  readCase(
    'analyze-resource-images',
    'analyze_resource_images',
    '读取这张已上传图片中的文字；它的文档资源是 [document:{{ATTACHMENT_ID}}]。',
    { attachment: true },
  ),
  writeCase(
    'save-attachment-to-cloud',
    'save_attachment_to_cloud',
    '把本轮附件原文件保存到云空间文件夹“{{FOLDER_NAME}}”，文件名使用“{{FILE_NAME}}”；如果文件夹不存在就创建。[attachment:{{ATTACHMENT_ID}}]',
    { attachment: true, after: 'capture_cloud_file' },
  ),
  readCase('query-files', 'query_files', '查询我云空间里文件名包含“{{PREFIX}}”的图片文件。'),
  readCase('query-cloud-folders', 'query_cloud_folders', '查询名称包含“{{PREFIX}}”的云空间文件夹。'),
  readCase('get-storage-usage', 'get_storage_usage', '我的云空间现在用了多少容量，各类文件分别有多少？'),
  readCase('query-inbox', 'query_inbox', '列出我的待整理箱里最近加入的内容。'),
  readCase('search-content', 'search_content', '在我的个人知识中搜索“{{PREFIX}}”，并根据真实原文回答。'),
  readCase('get-ai-quota', 'get_ai_quota', '我今天还剩多少 AI 额度？'),
  readCase('get-security-events', 'get_security_events', '查询今天的安全攻击事件明细。'),
  readCase('get-security-summary', 'get_security_summary', '给我当前安全风险概览，包括高风险 IP 和账号。'),
  readCase('query-users', 'query_users', '今天有多少新用户？', { assertion: 'today_new_user_count' }),
  readCase('query-api-logs', 'query_api_logs', '查询今天最近的 API 请求日志。'),
  readCase('query-operation-logs', 'query_operation_logs', '查询今天最近的用户操作日志。'),
  readCase('get-active-users', 'get_active_users', '今天平台最活跃的用户排行是什么？'),
  readCase('get-token-usage', 'get_token_usage', '统计今天全平台 AI Token 的请求次数和消耗。'),
  readCase('query-trash', 'query_trash', '查询回收站里标题为“{{NOTE_TITLE}}”的笔记。', {
    before: 'trash_note',
  }),
  writeCase('restore-trash', 'restore_trash', '从回收站恢复笔记 [note:{{NOTE_ID}}]。'),
  writeCase('add-tag', 'add_tag', '创建一个名为“{{TAG_NAME}}”的新标签。'),
  readCase('query-tags', 'query_tags', '查询名称包含“{{PREFIX}}”的标签及关联资源数量。'),
  writeCase(
    'write-knowledge-base',
    'write_knowledge_base',
    '向系统知识库新增内部 Markdown 条目，标题“{{KB_TITLE}}”，正文“{{PREFIX}} 真实链路测试内容”，分类为“内部知识”。',
  ),
  readCase('search-knowledge-base', 'search_knowledge_base', '在轻笺知识库里查询如何创建书签，只依据知识库回答。'),
  readCase('get-user-info', 'get_user_info', '查看我当前 root 账号的个人信息。'),
  writeCase(
    'create-bookmark',
    'create_bookmark',
    '把 {{BOOKMARK_URL}} 收藏为书签，名称为“{{BOOKMARK_TITLE}}”，描述为“{{PREFIX}} 真实链路测试”。',
  ),
  readCase('query-bookmarks', 'query_bookmarks', '查询名称包含“{{PREFIX}}”的书签。'),
  readCase('read-url', 'read_url', '读取 https://example.com/ 并根据网页真实内容用一句话概括。', {
    externalWeb: true,
  }),
  readCase('get-growth', 'get_growth', '查看我的成长等级、经验、积分余额和签到状态。'),
  readCase('query-points-log', 'query_points_log', '查看我最近的积分收入和支出明细。'),
  readCase('get-points-summary', 'get_points_summary', '总结我最近的积分来源、节奏和目标进度。'),
  readCase('query-notifications', 'query_notifications', '我有多少未读通知，最近有哪些站内消息？'),
  readCase('query-link-health', 'query_link_health', '只查看上一次书签死链体检结果，不要重新检查。'),
  readCase('start-link-health-check', 'start_link_health_check', '立即检查我现在有哪些失效书签链接。'),
  readCase('get-recap', 'get_recap', '生成我的本周内容回顾。'),
  readCase('query-feedback', 'query_feedback', '查看我提交过的意见反馈及回复状态。'),
  readCase('query-weekly-challenge', 'query_weekly_challenge', '查看我本周挑战的进度和领取状态。'),
  readCase('get-lottery-status', 'get_lottery_status', '我今天还有免费抽奖次数吗，距离保底还有几抽？'),
  readCase('query-my-devices', 'query_my_devices', '查询我最近登录过的设备。'),
  readCase('get-shop-status', 'get_shop_status', '查看积分商店、我已有的装扮和可以领取的头像框。'),
  readCase('get-insights', 'get_insights', '分析我的收藏总量、本月新增、高频标签和未打标签书签。'),
  readCase('get-points-overview', 'get_points_overview', '给我全站积分发放、消耗、存量和用户排行概览。'),
  readCase('get-user-detail', 'get_user_detail', '查询用户 ID {{TARGET_USER_ID}} 的成长等级和积分详情。'),
  readCase('get-pending-feedback', 'get_pending_feedback', '全站有多少待回复反馈，最近几条是什么？'),
  readCase('get-resource-creation-ranking', 'get_resource_creation_ranking', '今天全平台新增笔记数量排行前三是谁？'),
  readCase('query-platform-resources', 'query_platform_resources', '今天全平台新增的笔记标题分别是什么？'),
  readCase(
    'query-new-user-resources',
    'query_new_user_resources',
    '今天新注册的用户今天分别新增了哪些书签、笔记或云空间文件？',
  ),
  readCase('get-checkin-ranking', 'get_checkin_ranking', '目前全站累计签到天数排行榜前十是谁？'),
]);

export const ROOT_E2E_CRITICAL_CASE_IDS = Object.freeze([
  'query-users',
  'query-notes',
  'get-resource-creation-ranking',
  'query-platform-resources',
  'query-new-user-resources',
]);

export function rootE2EToolNames(cases = ROOT_E2E_TOOL_CASES) {
  return cases.map((item) => item.toolName);
}

export function selectRootE2ECases(suite = 'full') {
  if (suite === 'full') return ROOT_E2E_TOOL_CASES;
  if (suite === 'critical') {
    const ids = new Set(ROOT_E2E_CRITICAL_CASE_IDS);
    return ROOT_E2E_TOOL_CASES.filter((item) => ids.has(item.id));
  }
  throw new Error('ROOT_E2E_SUITE_NOT_SUPPORTED');
}
