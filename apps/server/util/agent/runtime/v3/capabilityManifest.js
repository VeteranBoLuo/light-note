import { AGENT_ACTION_CAPABILITIES } from '../../capabilityRegistry.js';

export const AGENT_CAPABILITY_MANIFEST_VERSION = '3.0';

const VALID_EFFECTS = new Set(['read', 'write']);
const VALID_STATUSES = new Set(['enabled', 'planned', 'forbidden']);
const VALID_ROLES = new Set(['user', 'root']);
const VALID_TEMPORAL_KINDS = new Set(['range', 'date', 'datetime']);
const VALID_TEMPORAL_DEFAULT_POLICIES = new Set(['all', 'clarify', 'server_default', 'none']);
const VALID_SIDE_EFFECT_POLICIES = new Set(['none', 'confirmation_required', 'idempotent_background_job']);
export const AGENT_CAPABILITY_DOMAINS = Object.freeze([
  'content',
  'note',
  'bookmark',
  'file',
  'todo',
  'tag',
  'account',
  'growth',
  'admin',
  'web',
]);
const VALID_DOMAINS = new Set(AGENT_CAPABILITY_DOMAINS);
const VALID_SCOPE_POLICIES = new Set([
  'public_product',
  'owner_bound',
  'grounding_scope_bound',
  'explicit_resource_only',
  'explicit_url_only',
  'root_context_bound',
  'confirmation_owner_bound',
  'manual_only',
  'forbidden',
]);

function freezeStrings(values = []) {
  return Object.freeze([...new Set(values.map(String).map((value) => value.trim()).filter(Boolean))]);
}

function freezeTemporalSlots(values = []) {
  return Object.freeze(
    (Array.isArray(values) ? values : []).map((value) =>
      Object.freeze({
        name: String(value?.name || '').trim(),
        kind: String(value?.kind || '').trim(),
        label: String(value?.label || '').trim(),
        required: value?.required === true,
        allowAll: value?.allowAll === true,
        autoBind: value?.autoBind === true,
        defaultPolicy: VALID_TEMPORAL_DEFAULT_POLICIES.has(String(value?.defaultPolicy || ''))
          ? String(value.defaultPolicy)
          : 'none',
        disclosure: String(value?.disclosure || '').trim(),
        coBind: freezeStrings(value?.coBind),
      }),
    ),
  );
}

function defineToolCapability(toolName, input) {
  return Object.freeze({
    status: 'enabled',
    toolName,
    acceptedInputKinds: Object.freeze(['latest_message']),
    requiredSlots: Object.freeze([]),
    dependencies: Object.freeze([]),
    rolePolicy: Object.freeze(['user', 'root']),
    riskLevel: input.effect === 'write' ? 'low' : 'low',
    confirmationPolicy: input.effect === 'write' ? 'default' : 'none',
    sideEffectPolicy: input.effect === 'write' ? 'confirmation_required' : 'none',
    coverage: 'summary',
    artifactKind: 'none',
    temporalSlots: Object.freeze([]),
    ...input,
    domains: freezeStrings(input.domains),
    operations: freezeStrings(input.operations),
    acceptedInputKinds: freezeStrings(input.acceptedInputKinds || ['latest_message']),
    requiredSlots: freezeStrings(input.requiredSlots),
    dependencies: freezeStrings(input.dependencies),
    rolePolicy: freezeStrings(input.rolePolicy || ['user', 'root']),
    temporalSlots: freezeTemporalSlots(input.temporalSlots),
    compilerDescription: String(input.compilerDescription || '').trim(),
  });
}

/**
 * Agent V3 的产品能力清单。
 *
 * 这里显式描述“产品能力 -> 工具”的稳定映射；V3 编译器只选择 capability id，
 * 路由器只做精确映射。工具名、文件名、中文关键词和历史回答都不能参与二次语义猜测。
 */
export const TOOL_CAPABILITY_MANIFEST = Object.freeze({
  search_knowledge_base: defineToolCapability('search_knowledge_base', {
    id: 'product_help.search',
    label: '查询轻笺产品帮助',
    domains: ['content'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['query'],
    scopePolicy: 'public_product',
    resultKind: 'product_help_results',
  }),
  query_bookmarks: defineToolCapability('query_bookmarks', {
    id: 'bookmark.query',
    label: '查询书签',
    domains: ['bookmark'],
    effect: 'read',
    operations: ['read'],
    acceptedInputKinds: ['latest_message', 'workspace_query'],
    scopePolicy: 'owner_bound',
    resultKind: 'bookmark_list',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: '书签创建时间', allowAll: true, autoBind: true }],
  }),
  query_notes: defineToolCapability('query_notes', {
    id: 'note.query',
    label: '查询笔记',
    domains: ['note'],
    effect: 'read',
    operations: ['read'],
    acceptedInputKinds: ['latest_message', 'workspace_query'],
    scopePolicy: 'owner_bound',
    resultKind: 'note_list',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: '笔记创建时间', allowAll: true, autoBind: true }],
  }),
  query_todos: defineToolCapability('query_todos', {
    id: 'todo.query',
    label: '查询待办',
    domains: ['todo'],
    effect: 'read',
    operations: ['read'],
    acceptedInputKinds: ['latest_message', 'workspace_query', 'last_result_refs'],
    scopePolicy: 'owner_bound',
    resultKind: 'todo_list',
    temporalSlots: [
      { name: 'planDate', kind: 'date', label: '待办计划日期', autoBind: true },
      { name: 'reminderAt', kind: 'datetime', label: '待办提醒时间', autoBind: true, coBind: ['planDate'] },
    ],
  }),
  set_todo_status: defineToolCapability('set_todo_status', {
    id: 'todo.status.set',
    label: '修改待办状态',
    domains: ['todo'],
    effect: 'write',
    operations: ['complete', 'reopen'],
    requiredSlots: ['status'],
    dependencies: ['todo.query'],
    acceptedInputKinds: ['latest_message', 'last_result_refs'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'todo_status_change',
    riskLevel: 'low',
    confirmationPolicy: 'always',
  }),
  delete_todo: defineToolCapability('delete_todo', {
    id: 'todo.delete',
    label: '删除待办',
    domains: ['todo'],
    effect: 'write',
    operations: ['delete'],
    dependencies: ['todo.query'],
    acceptedInputKinds: ['latest_message', 'last_result_refs'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'todo_deletion',
    riskLevel: 'medium',
    confirmationPolicy: 'always',
  }),
  create_todo: defineToolCapability('create_todo', {
    id: 'todo.create',
    label: '创建待办',
    domains: ['todo'],
    effect: 'write',
    operations: ['create'],
    requiredSlots: ['title'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'todo',
  }),
  preview_todo_plan: defineToolCapability('preview_todo_plan', {
    id: 'todo.plan.preview',
    label: '预览周期待办计划',
    domains: ['todo'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['title', 'timing', 'plan', 'reminder'],
    scopePolicy: 'owner_bound',
    resultKind: 'todo_plan_preview',
  }),
  create_todo_plan: defineToolCapability('create_todo_plan', {
    id: 'todo.plan.create',
    label: '创建周期待办计划',
    domains: ['todo'],
    effect: 'write',
    operations: ['create'],
    requiredSlots: ['title', 'timing', 'plan', 'reminder'],
    dependencies: ['todo.plan.preview'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'todo_plan',
    riskLevel: 'medium',
    confirmationPolicy: 'always',
  }),
  read_note: defineToolCapability('read_note', {
    id: 'note.read',
    label: '读取单篇笔记正文',
    domains: ['note'],
    effect: 'read',
    operations: ['read'],
    acceptedInputKinds: ['latest_message', 'selected_resource', 'last_result_refs'],
    scopePolicy: 'grounding_scope_bound',
    resultKind: 'note_document',
    coverage: 'full',
  }),
  analyze_resource_images: defineToolCapability('analyze_resource_images', {
    id: 'content.image.analyze',
    label: '识别资源中的图片内容',
    domains: ['content', 'note', 'file', 'bookmark'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['resourceType', 'resourceId'],
    acceptedInputKinds: ['selected_resource', 'last_result_refs'],
    scopePolicy: 'explicit_resource_only',
    resultKind: 'image_analysis',
    coverage: 'full',
  }),
  query_files: defineToolCapability('query_files', {
    id: 'file.query',
    label: '查询云空间文件',
    domains: ['file'],
    effect: 'read',
    operations: ['read'],
    acceptedInputKinds: ['latest_message', 'workspace_query'],
    scopePolicy: 'owner_bound',
    resultKind: 'file_list',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: '文件创建时间', allowAll: true, autoBind: true }],
  }),
  query_cloud_folders: defineToolCapability('query_cloud_folders', {
    id: 'file.folder.query',
    label: '查询云空间目录',
    domains: ['file'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'folder_list',
  }),
  query_inbox: defineToolCapability('query_inbox', {
    id: 'inbox.query',
    label: '查询待整理内容',
    domains: ['content', 'todo', 'bookmark', 'note', 'file'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'inbox_list',
  }),
  search_content: defineToolCapability('search_content', {
    id: 'content.search',
    label: '跨类型检索个人内容',
    domains: ['content', 'note', 'bookmark', 'file', 'todo'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['keyword'],
    acceptedInputKinds: ['latest_message', 'workspace_query', 'selected_scope'],
    scopePolicy: 'grounding_scope_bound',
    resultKind: 'content_search_results',
  }),
  get_storage_usage: defineToolCapability('get_storage_usage', {
    id: 'account.storage.read',
    label: '查询存储空间使用情况',
    domains: ['account', 'file'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'storage_usage',
  }),
  get_ai_quota: defineToolCapability('get_ai_quota', {
    id: 'account.ai_quota.read',
    label: '查询 AI 额度',
    domains: ['account'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'ai_quota',
  }),
  get_security_events: defineToolCapability('get_security_events', {
    id: 'admin.security.events.read',
    label: '查询安全事件',
    domains: ['admin', 'account'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'security_event_list',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: '安全事件时间', autoBind: true }],
  }),
  get_security_summary: defineToolCapability('get_security_summary', {
    id: 'admin.security.summary.read',
    label: '查询安全概况',
    domains: ['admin', 'account'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'security_summary',
  }),
  query_users: defineToolCapability('query_users', {
    id: 'admin.user.query',
    label: '查询平台用户',
    domains: ['admin'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'user_list',
    temporalSlots: [{ name: 'registeredWithin', kind: 'range', label: '用户注册时间', autoBind: true }],
  }),
  query_api_logs: defineToolCapability('query_api_logs', {
    id: 'admin.api_log.query',
    label: '查询 API 日志',
    domains: ['admin'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'api_log_list',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: 'API 日志时间', autoBind: true }],
  }),
  query_operation_logs: defineToolCapability('query_operation_logs', {
    id: 'admin.operation_log.query',
    label: '查询操作日志',
    domains: ['admin'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'operation_log_list',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: '操作日志时间', autoBind: true }],
  }),
  get_active_users: defineToolCapability('get_active_users', {
    id: 'admin.user.active.read',
    label: '查询活跃用户',
    domains: ['admin'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'active_user_metrics',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: '用户活跃时间', autoBind: true }],
  }),
  get_token_usage: defineToolCapability('get_token_usage', {
    id: 'admin.ai_token_usage.read',
    label: '查询 AI Token 用量',
    domains: ['admin'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'token_usage',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: 'Token 统计时间', autoBind: true }],
  }),
  create_note: defineToolCapability('create_note', {
    id: 'note.create',
    label: '创建 Markdown 笔记',
    domains: ['note'],
    effect: 'write',
    operations: ['create'],
    requiredSlots: ['title'],
    acceptedInputKinds: ['latest_message', 'selected_resource', 'workspace_query', 'last_result_refs'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'note_draft',
    artifactKind: 'note',
    coverage: 'full',
  }),
  create_image_note: defineToolCapability('create_image_note', {
    id: 'note.create_image',
    label: '创建图片笔记',
    domains: ['note', 'file'],
    effect: 'write',
    operations: ['create'],
    requiredSlots: ['attachmentId'],
    acceptedInputKinds: ['selected_resource'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'image_note',
  }),
  save_attachment_to_cloud: defineToolCapability('save_attachment_to_cloud', {
    id: 'cloud.attachment.save',
    label: '保存附件到云空间',
    domains: ['file'],
    effect: 'write',
    operations: ['save', 'upload'],
    requiredSlots: ['attachmentId'],
    dependencies: ['file.folder.query'],
    acceptedInputKinds: ['selected_resource'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'cloud_file',
  }),
  query_trash: defineToolCapability('query_trash', {
    id: 'trash.query',
    label: '查询回收站',
    domains: ['content', 'note', 'bookmark', 'file'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'trash_list',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: '删除时间', autoBind: true }],
  }),
  restore_trash: defineToolCapability('restore_trash', {
    id: 'trash.restore',
    label: '恢复回收站内容',
    domains: ['content', 'note', 'bookmark', 'file'],
    effect: 'write',
    operations: ['restore'],
    dependencies: ['trash.query'],
    acceptedInputKinds: ['latest_message', 'last_result_refs'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'restored_resource',
    riskLevel: 'medium',
    confirmationPolicy: 'always',
    temporalSlots: [{ name: 'timeRange', kind: 'range', label: '删除时间', autoBind: true }],
  }),
  add_tag: defineToolCapability('add_tag', {
    id: 'tag.create',
    label: '创建标签',
    domains: ['tag'],
    effect: 'write',
    operations: ['create'],
    requiredSlots: ['tagName'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'tag',
  }),
  query_tags: defineToolCapability('query_tags', {
    id: 'tag.query',
    label: '查询标签',
    domains: ['tag'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'tag_list',
  }),
  write_knowledge_base: defineToolCapability('write_knowledge_base', {
    id: 'knowledge.upsert',
    label: '维护产品知识库',
    domains: ['content', 'note', 'admin'],
    effect: 'write',
    operations: ['create', 'update'],
    requiredSlots: ['title'],
    rolePolicy: ['root'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'knowledge_entry',
    riskLevel: 'high',
    confirmationPolicy: 'always',
  }),
  get_user_info: defineToolCapability('get_user_info', {
    id: 'account.profile.read',
    label: '查询当前账号信息',
    domains: ['account'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'account_profile',
  }),
  create_bookmark: defineToolCapability('create_bookmark', {
    id: 'bookmark.create',
    label: '创建书签',
    domains: ['bookmark'],
    effect: 'write',
    operations: ['create'],
    requiredSlots: ['url'],
    scopePolicy: 'confirmation_owner_bound',
    resultKind: 'bookmark',
  }),
  read_url: defineToolCapability('read_url', {
    id: 'web.read',
    label: '读取并分析网页',
    domains: ['web', 'bookmark'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['url'],
    acceptedInputKinds: ['latest_message', 'selected_resource', 'last_result_refs'],
    scopePolicy: 'explicit_url_only',
    resultKind: 'web_document',
    coverage: 'full',
  }),
  get_growth: defineToolCapability('get_growth', {
    id: 'growth.profile.read',
    label: '查询成长信息',
    domains: ['growth'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'growth_profile',
  }),
  query_points_log: defineToolCapability('query_points_log', {
    id: 'growth.points_log.query',
    label: '查询积分明细',
    domains: ['growth'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'points_log',
  }),
  get_points_summary: defineToolCapability('get_points_summary', {
    id: 'growth.points_summary.read',
    label: '查询积分汇总',
    domains: ['growth'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'points_summary',
  }),
  query_notifications: defineToolCapability('query_notifications', {
    id: 'account.notification.query',
    label: '查询通知',
    domains: ['account'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'notification_list',
  }),
  query_link_health: defineToolCapability('query_link_health', {
    id: 'bookmark.health.query',
    label: '查询书签链接健康状态',
    domains: ['bookmark'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'link_health_report',
  }),
  start_link_health_check: defineToolCapability('start_link_health_check', {
    id: 'bookmark.health.start',
    label: '启动书签链接检查',
    domains: ['bookmark'],
    effect: 'write',
    operations: ['create'],
    scopePolicy: 'owner_bound',
    resultKind: 'link_health_job',
    confirmationPolicy: 'none',
    sideEffectPolicy: 'idempotent_background_job',
  }),
  get_recap: defineToolCapability('get_recap', {
    id: 'content.recap.read',
    label: '生成内容回顾',
    domains: ['content', 'note', 'bookmark', 'file', 'todo'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'content_recap',
  }),
  query_feedback: defineToolCapability('query_feedback', {
    id: 'account.feedback.query',
    label: '查询我的反馈',
    domains: ['account'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'feedback_list',
  }),
  query_weekly_challenge: defineToolCapability('query_weekly_challenge', {
    id: 'growth.weekly_challenge.read',
    label: '查询每周挑战',
    domains: ['growth'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'weekly_challenge',
  }),
  get_lottery_status: defineToolCapability('get_lottery_status', {
    id: 'growth.lottery.read',
    label: '查询抽奖状态',
    domains: ['growth'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'lottery_status',
  }),
  query_my_devices: defineToolCapability('query_my_devices', {
    id: 'account.device.query',
    label: '查询登录设备',
    domains: ['account'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'device_list',
  }),
  get_shop_status: defineToolCapability('get_shop_status', {
    id: 'growth.shop.read',
    label: '查询积分商城状态',
    domains: ['growth'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'shop_status',
  }),
  get_insights: defineToolCapability('get_insights', {
    id: 'content.insights.read',
    label: '查询内容洞察',
    domains: ['content', 'bookmark', 'note', 'file', 'tag'],
    effect: 'read',
    operations: ['read'],
    scopePolicy: 'owner_bound',
    resultKind: 'content_insights',
  }),
  get_points_overview: defineToolCapability('get_points_overview', {
    id: 'admin.points.overview.read',
    label: '查询平台积分概况',
    domains: ['admin', 'growth'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'platform_points_overview',
  }),
  get_user_detail: defineToolCapability('get_user_detail', {
    id: 'admin.user.detail.read',
    label: '查询指定用户详情',
    domains: ['admin', 'account', 'growth'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['user'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'user_detail',
  }),
  get_pending_feedback: defineToolCapability('get_pending_feedback', {
    id: 'admin.feedback.pending.read',
    label: '查询待处理反馈',
    domains: ['admin'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'pending_feedback',
  }),
  get_resource_creation_ranking: defineToolCapability('get_resource_creation_ranking', {
    id: 'admin.resource.ranking.read',
    label: '查询资源创建排行',
    compilerDescription:
      '按用户统计书签、笔记或云空间文件排行，可查询指定时间段的新增排行或当前有效存量排行；未指定时间口径时按全部时间统计当前有效存量。',
    domains: ['admin', 'content', 'note', 'bookmark', 'file'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['timeRange'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'resource_ranking',
    temporalSlots: [
      {
        name: 'timeRange',
        kind: 'range',
        label: '资源创建时间',
        required: true,
        allowAll: true,
        autoBind: true,
        defaultPolicy: 'all',
        disclosure: '未指定时间时按全部时间统计',
      },
      { name: 'registeredWithin', kind: 'range', label: '用户注册时间' },
    ],
  }),
  query_platform_resources: defineToolCapability('query_platform_resources', {
    id: 'admin.resource.query',
    label: '查询平台资源',
    compilerDescription:
      '查询平台书签、笔记或云空间文件明细，可限定资源创建时间与用户注册时间；未指定资源创建时间时按全部时间查询当前有效资源。',
    domains: ['admin', 'content', 'note', 'bookmark', 'file'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['timeRange'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'platform_resource_list',
    temporalSlots: [
      {
        name: 'timeRange',
        kind: 'range',
        label: '资源创建时间',
        required: true,
        allowAll: true,
        autoBind: true,
        defaultPolicy: 'all',
        disclosure: '未指定时间时按全部时间统计',
      },
      { name: 'registeredWithin', kind: 'range', label: '用户注册时间' },
    ],
  }),
  query_new_user_resources: defineToolCapability('query_new_user_resources', {
    id: 'admin.new_user.resource.query',
    label: '查询新增用户创建的资源',
    compilerDescription:
      '查询指定注册时间范围内的新增用户在指定资源创建时间范围内创建的书签、笔记或文件；两个时间范围缺失时必须先澄清。',
    domains: ['admin', 'content', 'note', 'bookmark', 'file'],
    effect: 'read',
    operations: ['read'],
    requiredSlots: ['registeredWithin', 'resourceTimeRange'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'new_user_resource_list',
    temporalSlots: [
      {
        name: 'registeredWithin',
        kind: 'range',
        label: '用户注册时间',
        required: true,
        autoBind: true,
        defaultPolicy: 'clarify',
        disclosure: '未指定新增用户范围时先澄清',
      },
      {
        name: 'resourceTimeRange',
        kind: 'range',
        label: '资源创建时间',
        required: true,
        autoBind: true,
        defaultPolicy: 'clarify',
        disclosure: '未指定资源创建范围时先澄清',
      },
    ],
  }),
  get_checkin_ranking: defineToolCapability('get_checkin_ranking', {
    id: 'admin.checkin.ranking.read',
    label: '查询签到排行',
    domains: ['admin', 'growth'],
    effect: 'read',
    operations: ['read'],
    rolePolicy: ['root'],
    scopePolicy: 'root_context_bound',
    resultKind: 'checkin_ranking',
    temporalSlots: [
      { name: 'timeRange', kind: 'range', label: '签到统计时间', allowAll: true, autoBind: true },
      { name: 'registeredWithin', kind: 'range', label: '用户注册时间' },
    ],
  }),
});

const NON_EXECUTABLE_CAPABILITY_META = Object.freeze({
  'note.delete': { domains: ['note'] },
  'bookmark.delete': { domains: ['bookmark'] },
  'file.delete': { domains: ['file'] },
  'tag.delete': { domains: ['tag'] },
  'note.update': { domains: ['note'] },
  'bookmark.update': { domains: ['bookmark'] },
  'file.manage': { domains: ['file'] },
  'tag.assign': { domains: ['tag', 'bookmark', 'note', 'file'] },
  'todo.manage': { domains: ['todo'] },
  'inbox.manage': { domains: ['content', 'todo'] },
  'data.permanent_delete': { domains: ['content', 'note', 'bookmark', 'file', 'todo', 'tag'] },
  'account.security.manage': { domains: ['account'] },
  'growth.integrity.manage': { domains: ['growth'] },
  'admin.mutation': { domains: ['admin'], rolePolicy: ['root'] },
});

export const NON_EXECUTABLE_CAPABILITY_MANIFEST = Object.freeze(
  AGENT_ACTION_CAPABILITIES.filter((capability) => capability.status !== 'enabled').map((capability) => {
    const metadata = NON_EXECUTABLE_CAPABILITY_META[capability.id];
    if (!metadata) throw new Error(`Agent V3 非执行能力缺少显式元数据：${capability.id}`);
    return Object.freeze({
      id: capability.id,
      label: String(capability.labels?.zh || capability.id),
      status: capability.status,
      toolName: '',
      domains: freezeStrings(metadata.domains),
      effect: 'write',
      operations: freezeStrings(capability.operations),
      acceptedInputKinds: Object.freeze(['latest_message']),
      requiredSlots: Object.freeze([]),
      dependencies: Object.freeze([]),
      rolePolicy: freezeStrings(metadata.rolePolicy || ['user', 'root']),
      scopePolicy: capability.status === 'forbidden' ? 'forbidden' : 'manual_only',
      resultKind: 'none',
      riskLevel: capability.status === 'forbidden' ? 'high' : 'medium',
      confirmationPolicy: 'none',
      sideEffectPolicy: 'none',
      coverage: 'none',
      artifactKind: 'none',
      temporalSlots: Object.freeze([]),
      guidance: Object.freeze({
        zh: String(capability.guidance?.zh || ''),
        en: String(capability.guidance?.en || ''),
      }),
    });
  }),
);

export const AGENT_CAPABILITY_MANIFEST = Object.freeze([
  ...Object.values(TOOL_CAPABILITY_MANIFEST),
  ...NON_EXECUTABLE_CAPABILITY_MANIFEST,
]);

const CAPABILITY_BY_ID = new Map(AGENT_CAPABILITY_MANIFEST.map((capability) => [capability.id, capability]));

export function getAgentV3CapabilityById(id) {
  return CAPABILITY_BY_ID.get(String(id || '')) || null;
}

export function getAgentV3CapabilityByToolName(toolName) {
  return TOOL_CAPABILITY_MANIFEST[String(toolName || '')] || null;
}

export function capabilityProducesAgentV3Artifact(capability) {
  return Boolean(capability && capability.artifactKind !== 'none');
}

export function normalizeCapabilityScope(value, { actorRole } = {}) {
  const requestedDomains = freezeStrings(
    (Array.isArray(value?.requestedDomains)
      ? value.requestedDomains
      : Array.isArray(value?.domains)
        ? value.domains
        : []
    ).map((domain) => String(domain || '').toLowerCase()),
  ).slice(0, 4);
  const canonicalRole = actorRole == null ? null : actorRole === 'root' ? 'root' : 'user';
  const roleDomains = canonicalRole
    ? new Set(
        AGENT_CAPABILITY_MANIFEST.filter((capability) => capability.rolePolicy.includes(canonicalRole)).flatMap(
          (capability) => capability.domains,
        ),
      )
    : VALID_DOMAINS;
  const domains = requestedDomains.filter((domain) => VALID_DOMAINS.has(domain) && roleDomains.has(domain));
  const rejectedDomains = requestedDomains.filter((domain) => !domains.includes(domain));
  const mode = requestedDomains.length ? (domains.length ? 'restricted' : 'forbidden') : 'auto';
  return Object.freeze({
    mode,
    domains: Object.freeze(domains),
    requestedDomains: Object.freeze(requestedDomains),
    rejectedDomains: Object.freeze(rejectedDomains),
    provenance: requestedDomains.length ? 'user_explicit' : 'automatic',
  });
}

function capabilityInScope(capability, scope) {
  if (scope?.mode === 'forbidden') return false;
  if (!scope?.domains?.length) return true;
  return capability.domains.some((domain) => scope.domains.includes(domain));
}

export function buildAgentV3CapabilityCatalog(
  tools,
  { availableToolNames, actorRole = 'user', capabilityScope = null } = {},
) {
  const toolList = Array.isArray(tools) ? tools : [...(tools?.values?.() || [])];
  const registeredByName = new Map(toolList.filter(Boolean).map((tool) => [tool.name, tool]));
  const available =
    availableToolNames instanceof Set ? availableToolNames : new Set(toolList.map((tool) => tool?.name).filter(Boolean));
  const scope = normalizeCapabilityScope(capabilityScope, { actorRole });
  const catalog = [];
  for (const capability of AGENT_CAPABILITY_MANIFEST) {
    if (!capability.rolePolicy.includes(actorRole === 'root' ? 'root' : 'user')) continue;
    if (!capabilityInScope(capability, scope)) continue;
    const tool = capability.toolName ? registeredByName.get(capability.toolName) : null;
    const status = capability.toolName
      ? tool && available.has(capability.toolName)
        ? 'enabled'
        : 'unavailable'
      : capability.status;
    catalog.push(
      Object.freeze({
        ...capability,
        status,
        toolNames: Object.freeze(status === 'enabled' && capability.toolName ? [capability.toolName] : []),
        description: String(capability.compilerDescription || tool?.description || capability.label),
      }),
    );
  }
  return Object.freeze(catalog);
}

export function validateAgentV3CapabilityManifest(tools) {
  const errors = [];
  const toolList = Array.isArray(tools) ? tools : [...(tools?.values?.() || [])];
  const toolNames = new Set(toolList.map((tool) => String(tool?.name || '')).filter(Boolean));
  const seenIds = new Set();
  const seenTools = new Set();

  for (const capability of AGENT_CAPABILITY_MANIFEST) {
    if (!capability.id || seenIds.has(capability.id)) errors.push(`能力 ID 重复或为空：${capability.id || 'unknown'}`);
    seenIds.add(capability.id);
    if (!VALID_STATUSES.has(capability.status)) errors.push(`能力 ${capability.id} 的 status 无效`);
    if (!VALID_EFFECTS.has(capability.effect)) errors.push(`能力 ${capability.id} 的 effect 无效`);
    if (!capability.domains.length) errors.push(`能力 ${capability.id} 缺少 domains`);
    if (capability.domains.some((domain) => !VALID_DOMAINS.has(domain))) {
      errors.push(`能力 ${capability.id} 含未知 domain`);
    }
    if (!capability.operations.length) errors.push(`能力 ${capability.id} 缺少 operations`);
    if (!capability.resultKind) errors.push(`能力 ${capability.id} 缺少 resultKind`);
    if (!['none', 'note'].includes(capability.artifactKind)) errors.push(`能力 ${capability.id} 的 artifactKind 无效`);
    if (!VALID_SIDE_EFFECT_POLICIES.has(capability.sideEffectPolicy)) {
      errors.push(`能力 ${capability.id} 的 sideEffectPolicy 无效`);
    }
    const temporalNames = new Set();
    for (const slot of capability.temporalSlots || []) {
      if (!slot.name || temporalNames.has(slot.name)) errors.push(`能力 ${capability.id} 的时间槽重复或为空`);
      temporalNames.add(slot.name);
      if (!VALID_TEMPORAL_KINDS.has(slot.kind)) errors.push(`能力 ${capability.id} 的时间槽 ${slot.name} 类型无效`);
      if (!VALID_TEMPORAL_DEFAULT_POLICIES.has(slot.defaultPolicy)) {
        errors.push(`能力 ${capability.id} 的时间槽 ${slot.name} 默认策略无效`);
      }
      if (slot.defaultPolicy === 'all' && slot.allowAll !== true) {
        errors.push(`能力 ${capability.id} 的时间槽 ${slot.name} 默认全部但未允许全部范围`);
      }
      if (slot.required === true && slot.defaultPolicy === 'none') {
        errors.push(`能力 ${capability.id} 的必填时间槽 ${slot.name} 缺少默认策略`);
      }
      if (slot.required === true && slot.defaultPolicy !== 'none' && !capability.compilerDescription) {
        errors.push(`能力 ${capability.id} 的编译器描述未声明时间默认策略`);
      }
      if (slot.required !== capability.requiredSlots.includes(slot.name)) {
        errors.push(`能力 ${capability.id} 的时间槽 ${slot.name} required 与 requiredSlots 不一致`);
      }
      if ((slot.coBind || []).some((name) => !(capability.temporalSlots || []).some((item) => item.name === name))) {
        errors.push(`能力 ${capability.id} 的时间槽 ${slot.name} 引用了不存在的联动槽`);
      }
    }
    if (!VALID_SCOPE_POLICIES.has(capability.scopePolicy)) errors.push(`能力 ${capability.id} 的 scopePolicy 无效`);
    if (capability.rolePolicy.some((role) => !VALID_ROLES.has(role))) errors.push(`能力 ${capability.id} 的角色策略无效`);
    for (const dependency of capability.dependencies) {
      if (!CAPABILITY_BY_ID.has(dependency)) errors.push(`能力 ${capability.id} 的依赖不存在：${dependency}`);
    }
    if (capability.toolName) {
      if (seenTools.has(capability.toolName)) errors.push(`工具重复绑定：${capability.toolName}`);
      seenTools.add(capability.toolName);
      const properties = capability.toolName ? toolNames.has(capability.toolName) : false;
      if (properties) {
        const registeredTool = toolList.find((tool) => tool?.name === capability.toolName);
        const toolSideEffectPolicy =
          registeredTool?.sideEffectPolicy ||
          (registeredTool?.isWrite === true ? 'confirmation_required' : 'none');
        if (capability.sideEffectPolicy !== toolSideEffectPolicy) {
          errors.push(`工具 ${capability.toolName} 的副作用策略与能力清单不一致`);
        }
        for (const slot of capability.temporalSlots || []) {
          if (!registeredTool?.parameters?.properties?.[slot.name]) {
            errors.push(`工具 ${capability.toolName} 缺少能力清单声明的时间参数 ${slot.name}`);
          }
        }
      }
    }
  }

  for (const tool of toolList) {
    const capability = TOOL_CAPABILITY_MANIFEST[tool.name];
    if (!capability) {
      errors.push(`已注册工具 ${tool.name} 没有 V3 能力定义`);
      continue;
    }
    const required = freezeStrings(tool?.parameters?.required || []);
    const declaredRequired = new Set(capability.requiredSlots);
    for (const slot of required) {
      if (!declaredRequired.has(slot)) errors.push(`工具 ${tool.name} 的必填参数 ${slot} 未写入 V3 能力清单`);
    }
    const actionCapability = AGENT_ACTION_CAPABILITIES.find((item) => item.toolName === tool.name);
    if (tool.isWrite === true && !actionCapability) errors.push(`写工具 ${tool.name} 缺少动作能力策略`);
    if (actionCapability) {
      if (capability.id !== actionCapability.id) errors.push(`写工具 ${tool.name} 的能力 ID 与动作策略不一致`);
      if (capability.riskLevel !== actionCapability.riskLevel) errors.push(`写工具 ${tool.name} 的风险级别不一致`);
      if (capability.confirmationPolicy !== actionCapability.confirmationPolicy) {
        errors.push(`写工具 ${tool.name} 的确认策略不一致`);
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (capability) => {
    if (visited.has(capability.id)) return;
    if (visiting.has(capability.id)) {
      errors.push(`能力依赖存在环：${capability.id}`);
      return;
    }
    visiting.add(capability.id);
    for (const dependency of capability.dependencies) {
      const target = CAPABILITY_BY_ID.get(dependency);
      if (target) visit(target);
    }
    visiting.delete(capability.id);
    visited.add(capability.id);
  };
  for (const capability of AGENT_CAPABILITY_MANIFEST) visit(capability);

  return Object.freeze([...new Set(errors)]);
}

export function assertAgentV3CapabilityManifest(tools) {
  const errors = validateAgentV3CapabilityManifest(tools);
  if (errors.length) throw new Error(`Agent V3 能力清单校验失败：\n- ${errors.join('\n- ')}`);
  return true;
}

export const __testing = Object.freeze({ capabilityInScope, defineToolCapability });
