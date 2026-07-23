const CAPABILITY_OVERVIEW_PATTERNS = [
  /^(?:你|轻笺智域|AI\s*助手).{0,8}(?:支持|具备|拥有|可以用|能用).{0,8}(?:哪些|什么).{0,4}(?:工具|功能|能力)[?？!！。\s]*$/i,
  /^(?:你能做什么|你可以做什么|介绍一下(?:你|轻笺智域|AI\s*助手)的(?:工具|功能|能力))[?？!！。\s]*$/i,
  /^(?:what\s+(?:tools|features|capabilities)\s+(?:do\s+you\s+support|can\s+you\s+use|do\s+you\s+have)|what\s+can\s+you\s+do)[?!.\\s]*$/i,
];

const READ_GROUPS = [
  {
    names: ['query_bookmarks', 'query_notes', 'query_tags', 'query_files', 'query_cloud_folders'],
    zh: '查询书签、笔记、标签、云空间文件和文件夹',
    en: 'query bookmarks, notes, tags, cloud files, and folders',
  },
  {
    names: ['search_content', 'read_note', 'analyze_resource_images', 'read_url'],
    zh: '搜索个人内容、读取笔记正文、按需分析图片或网页',
    en: 'search personal content and read notes, images, or web pages when needed',
  },
  {
    names: ['query_todos', 'query_inbox', 'query_notifications', 'query_trash'],
    zh: '查看待办、待整理、通知和回收站',
    en: 'view todos, inbox items, notifications, and Trash',
  },
  {
    names: [
      'get_user_info',
      'query_my_devices',
      'get_ai_quota',
      'get_storage_usage',
      'get_growth',
      'query_points_log',
      'get_shop_status',
      'get_lottery_status',
      'query_weekly_challenge',
      'get_recap',
      'get_insights',
      'query_link_health',
      'query_feedback',
    ],
    zh: '查看账号设备、额度与存储、成长积分、商店抽奖、周报洞察及链接健康',
    en: 'view account devices, quotas, storage, growth, points, recaps, insights, and link health',
  },
];

const WRITE_GROUPS = [
  {
    names: ['create_note', 'create_image_note'],
    zh: '创建普通笔记或图片笔记',
    en: 'create text or image notes',
  },
  { names: ['create_bookmark'], zh: '创建书签', en: 'create bookmarks' },
  { names: ['add_tag'], zh: '创建标签', en: 'create tags' },
  {
    names: ['save_attachment_to_cloud'],
    zh: '把本轮附件保存到云空间',
    en: 'save attachments from the current conversation to cloud storage',
  },
  { names: ['restore_trash'], zh: '恢复回收站内容', en: 'restore items from Trash' },
  { names: ['set_todo_status'], zh: '完成或重新打开单条待办', en: 'complete or reopen a single todo' },
];

const ROOT_TOOLS = [
  'query_users',
  'get_user_detail',
  'get_active_users',
  'query_api_logs',
  'query_operation_logs',
  'get_security_events',
  'get_security_summary',
  'get_token_usage',
  'get_points_overview',
  'get_pending_feedback',
  'write_knowledge_base',
];

function availableGroupLabels(groups, names, language) {
  return groups.filter((group) => group.names.some((name) => names.has(name))).map((group) => group[language]);
}

export function isAgentCapabilityOverviewRequest(message) {
  const text = String(message || '').trim();
  return Boolean(text && CAPABILITY_OVERVIEW_PATTERNS.some((pattern) => pattern.test(text)));
}

export function buildAgentCapabilityOverview({ tools = [], locale = 'zh-CN' } = {}) {
  const names = new Set((Array.isArray(tools) ? tools : []).map((tool) => String(tool?.name || '')).filter(Boolean));
  const language = String(locale || '')
    .toLowerCase()
    .startsWith('en')
    ? 'en'
    : 'zh';
  const reads = availableGroupLabels(READ_GROUPS, names, language);
  const writes = availableGroupLabels(WRITE_GROUPS, names, language);
  const hasRootTools = ROOT_TOOLS.some((name) => names.has(name));

  if (language === 'en') {
    const lines = ['I can currently help with:'];
    if (reads.length) lines.push(`- **Search and query:** ${reads.join('; ')}.`);
    if (writes.length) {
      lines.push(`- **Confirmed actions:** ${writes.join('; ')}. Every data change requires your confirmation first.`);
    }
    if (hasRootTools) {
      lines.push(
        '- **Administration:** query users, activity, API and operation logs, security events, AI usage, points, and feedback.',
      );
    }
    lines.push(
      '- **Current limits:** I cannot directly edit or delete existing notes/bookmarks, empty Trash, or change your email or password.',
    );
    return lines.join('\n');
  }

  const lines = ['我目前可以帮你：'];
  if (reads.length) lines.push(`- **查询与阅读**：${reads.join('；')}。`);
  if (writes.length) lines.push(`- **确认后执行**：${writes.join('；')}。所有数据变更都会先展示确认。`);
  if (hasRootTools) {
    lines.push('- **管理查询**：查看用户与活跃度、接口和操作日志、安全事件、AI 用量、积分与反馈。');
  }
  lines.push('- **当前边界**：暂不能直接编辑或删除已有笔记/书签、清空回收站，也不能修改邮箱或密码。');
  return lines.join('\n');
}
