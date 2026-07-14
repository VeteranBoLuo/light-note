const GROUPS = {
  base: ['search_content', 'search_knowledge_base', 'get_user_info', 'get_ai_quota'],
  bookmark: ['query_bookmarks', 'create_bookmark', 'query_link_health'],
  note: ['query_notes', 'create_note'],
  file: ['query_files', 'get_storage_usage'],
  tag: ['query_tags', 'add_tag'],
  trash: ['query_trash', 'restore_trash'],
  url: ['read_url', 'create_bookmark'],
  growth: [
    'get_growth',
    'query_points_log',
    'get_recap',
    'query_weekly_challenge',
    'get_lottery_status',
    'get_shop_status',
    'get_insights',
  ],
  account: ['query_notifications', 'query_my_devices', 'query_feedback'],
  admin: [
    'query_users',
    'get_user_detail',
    'get_active_users',
    'query_api_logs',
    'query_operation_logs',
    'get_token_usage',
    'get_security_events',
    'get_security_summary',
    'get_points_overview',
    'get_pending_feedback',
    'write_knowledge_base',
  ],
};

const INTENTS = [
  { pattern: /书签|收藏|网址|链接|bookmark|favorite/i, groups: ['bookmark'] },
  { pattern: /笔记|文档|note|markdown/i, groups: ['note'] },
  { pattern: /文件|云空间|容量|存储|file|storage/i, groups: ['file'] },
  { pattern: /标签|分类|tag/i, groups: ['tag'] },
  { pattern: /回收站|恢复|删除的|trash|restore/i, groups: ['trash'] },
  { pattern: /https?:\/\/|www\./i, groups: ['url'] },
  { pattern: /等级|经验|积分|成长|抽奖|商店|周挑战|回顾|洞察|level|points/i, groups: ['growth'] },
  { pattern: /通知|设备|反馈|notification|device|feedback/i, groups: ['account'] },
  { pattern: /用户|日志|安全|风控|活跃|成本|token|后台|admin|security/i, groups: ['admin'] },
];

function addGroup(names, group) {
  for (const name of GROUPS[group] || []) names.add(name);
}

export function selectAgentTools(registry, { message, userRole, allowWrite = true, allowVisitorWrite = false, maxTools = 10 }) {
  const selectedNames = new Set();
  addGroup(selectedNames, 'base');
  for (const intent of INTENTS) {
    if (!intent.pattern.test(String(message || ''))) continue;
    for (const group of intent.groups) addGroup(selectedNames, group);
  }

  // 没命中具体资源时补最常用的两类查询，保证自然语言泛问仍有可用数据能力。
  if (selectedNames.size === GROUPS.base.length) {
    addGroup(selectedNames, 'bookmark');
    addGroup(selectedNames, 'note');
  }

  const selected = [];
  for (const name of selectedNames) {
    const tool = registry.get(name);
    if (!tool) continue;
    if (tool.requireRoot && userRole !== 'root') continue;
    if (tool.isWrite && (!allowWrite || (userRole === 'visitor' && !allowVisitorWrite))) continue;
    selected.push(tool);
    if (selected.length >= Math.min(12, Math.max(1, maxTools))) break;
  }
  return selected;
}
