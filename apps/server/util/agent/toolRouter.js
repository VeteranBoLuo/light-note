import { isToolRoleAllowed } from './toolPolicy.js';
import { ROUTED_AGENT_WRITE_TOOL_NAMES } from './capabilityRegistry.js';
import { resolveAgentActionIntent } from './actionIntentPolicy.js';

const DEFAULT_MAX_TOOLS = 10;
const HARD_MAX_TOOLS = 12;
const SEMANTIC_PLANNER_MAX_TOOLS = 96;
const ACTION_SCORE = 800;

// GROUPS 仅供旧路由兼容与独立调用方使用。Agent 主链使用 semanticPlanner=true，
// 在权限过滤后向模型提供完整能力目录，不再用关键词决定模型能看到哪些业务能力。
const GROUPS = {
  generic: ['search_content', 'search_knowledge_base'],
  fallback: ['query_bookmarks', 'query_notes'],
  bookmark: ['query_bookmarks'],
  bookmarkHealth: ['query_link_health'],
  note: ['query_notes', 'read_note'],
  noteImage: ['analyze_resource_images'],
  file: ['query_files', 'query_cloud_folders', 'get_storage_usage'],
  tag: ['query_tags'],
  trash: ['query_trash'],
  url: ['read_url'],
  growth: ['get_growth', 'query_points_log', 'query_weekly_challenge', 'get_lottery_status', 'get_shop_status'],
  recap: ['get_recap'],
  insights: ['get_insights'],
  account: ['query_notifications', 'query_my_devices', 'query_feedback', 'get_user_info', 'get_ai_quota'],
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
  ],
  adminUsers: ['query_users', 'get_user_detail', 'get_active_users'],
  adminLogs: ['query_api_logs', 'query_operation_logs'],
  adminSecurity: ['get_security_events', 'get_security_summary'],
  adminToken: ['get_token_usage'],
  adminPoints: ['get_points_overview'],
  // 待办的通用意图只开放读取；状态写入仅由下方显式动作规则加入，避免“查看待办”误带写 schema。
  todo: ['query_todos'],
  inbox: ['query_inbox'],
};

const CONTEXT_GROUPS = {
  bookmark: ['bookmark'],
  note: ['note'],
  file: ['file'],
  tag: ['tag'],
};

const DOMAIN_INTENT_RULES = [
  { pattern: /书签|收藏|网址|链接|bookmark|favorite/i, groups: ['bookmark'] },
  { pattern: /笔记|文档|note|markdown/i, groups: ['note'] },
  { pattern: /文件|云空间|容量|存储|file|storage/i, groups: ['file'] },
  { pattern: /标签|分类|tag/i, groups: ['tag'] },
  { pattern: /回收站|恢复|删除的|trash|restore/i, groups: ['trash'] },
  { pattern: /https?:\/\/|www\./i, groups: ['url'] },
  { pattern: /等级|经验|积分|成长|抽奖|商店|周挑战|level|points/i, groups: ['growth'] },
  { pattern: /回顾|复盘|很久没|久未|那年今日|recap|revisit/i, groups: ['recap'] },
  { pattern: /分析|洞察|概览|insight|analy[sz]e/i, groups: ['insights'] },
  { pattern: /通知|设备|反馈|账号|个人资料|额度|配额|notification|device|feedback|quota/i, groups: ['account'] },
  { pattern: /用户|活跃/i, groups: ['adminUsers'] },
  { pattern: /日志|审计/i, groups: ['adminLogs'] },
  { pattern: /安全|风控|security/i, groups: ['adminSecurity'] },
  { pattern: /成本|token/i, groups: ['adminToken'] },
  { pattern: /积分总览|成长总览/i, groups: ['adminPoints'] },
  { pattern: /后台|admin/i, groups: ['admin'] },
  { pattern: /待办|任务|提醒|截止|todo/i, groups: ['todo'] },
  { pattern: /待整理|收集箱|稍后整理|inbox/i, groups: ['inbox'] },
  { pattern: /图片|截图|ocr|识图|图像/i, groups: ['noteImage'] },
  { pattern: /死链|失效链接|链接健康|link health/i, groups: ['bookmarkHealth'] },
];

export { ROUTED_AGENT_WRITE_TOOL_NAMES };

/**
 * 返回当前文本明确命中的写动作工具名，供最终回复安全门判断。
 * 与 Planner 前的动作意图策略共享唯一判定，避免路由层把“已完成的待办有哪些”
 * 之类状态筛选重新解释成写命令。
 */
export function matchAgentWriteActionToolNames(message, contextTypes = []) {
  const intent = resolveAgentActionIntent({ message, contextTypes });
  return intent.resolution === 'enabled' ? [...intent.toolNames] : [];
}

// 写工具的必要查询工具必须与动作一起参与排序，不能在注册顺序截断后消失。
const TOOL_DEPENDENCIES = {
  restore_trash: ['query_trash'],
  save_attachment_to_cloud: ['query_cloud_folders'],
  create_image_note: ['query_cloud_folders'],
  set_todo_status: ['query_todos'],
  enqueue_inbox: ['query_inbox'],
  complete_inbox: ['query_inbox'],
  set_resource_tags: ['query_tags'],
};

function normalizeMaxTools(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_TOOLS;
  return Math.min(HARD_MAX_TOOLS, Math.max(1, Math.trunc(parsed)));
}

function addScore(scores, names, score) {
  for (const name of names) {
    scores.set(name, (scores.get(name) || 0) + score);
  }
}

function addGroups(scores, groups, score) {
  for (const group of groups) addScore(scores, GROUPS[group] || [], score);
}

function getEligibleTools(registry, { userRole, allowWrite, allowVisitorWrite }) {
  const isVisitor = String(userRole || 'visitor').toLowerCase() === 'visitor';
  return [...registry.values()].filter((tool) => {
    if (!isToolRoleAllowed(tool, userRole)) return false;
    if (tool.isWrite && (!allowWrite || (isVisitor && !allowVisitorWrite))) return false;
    return true;
  });
}

function addDependencies(scores) {
  for (const [toolName, score] of [...scores.entries()]) {
    if (score <= 0) continue;
    for (const dependency of TOOL_DEPENDENCIES[toolName] || []) {
      // 依赖紧随显式动作，但动作本身始终保持更高优先级。
      scores.set(dependency, Math.max(scores.get(dependency) || 0, Math.max(1, score - 1)));
    }
  }
}

/**
 * 基于意图、显式上下文和必要工具依赖产生确定性候选。权限过滤发生在这里之前，
 * 最终同分按工具名排序，因此 registry 注册顺序不会再影响 schema 是否下发。
 */
export function selectAgentTools(
  registry,
  {
    message,
    contextTypes = [],
    userRole,
    allowWrite = true,
    allowVisitorWrite = false,
    maxTools = DEFAULT_MAX_TOOLS,
    semanticPlanner = false,
  },
) {
  const eligibleTools = getEligibleTools(registry, { userRole, allowWrite, allowVisitorWrite });
  if (semanticPlanner) {
    if (eligibleTools.length > SEMANTIC_PLANNER_MAX_TOOLS) {
      throw new Error(
        `Agent 可用工具数量 ${eligibleTools.length} 超过 Semantic Planner 安全上限 ${SEMANTIC_PLANNER_MAX_TOOLS}`,
      );
    }
    // 语义规划模式不再根据用户文本关键词预先裁剪工具。AI 能看到当前身份真正可用的完整能力，
    // 然后由结构化 Intent Envelope 选择能力；稳定排序只用于让 Prompt 和测试可复现。
    return eligibleTools.sort((left, right) => left.name.localeCompare(right.name));
  }
  const scores = new Map();
  const text = String(message || '');
  const actionIntent = resolveAgentActionIntent({ message: text, contextTypes });
  let hasDomainSignal = false;

  // 通用检索只作为低优先级兜底，不能再先占据四个 schema 名额。
  addGroups(scores, ['generic'], 20);

  for (const type of new Set(
    Array.isArray(contextTypes) ? contextTypes.map((item) => String(item || '').trim()) : [],
  )) {
    const groups = CONTEXT_GROUPS[type];
    if (!groups) continue;
    hasDomainSignal = true;
    addGroups(scores, groups, 400);
  }

  for (const intent of DOMAIN_INTENT_RULES) {
    if (!intent.pattern.test(text)) continue;
    hasDomainSignal = true;
    addGroups(scores, intent.groups, 220);
  }

  if (actionIntent.resolution === 'enabled') {
    hasDomainSignal = true;
    addScore(scores, actionIntent.toolNames, ACTION_SCORE);
  }

  if (!hasDomainSignal) addGroups(scores, ['fallback'], 10);
  addDependencies(scores);

  const ranked = eligibleTools
    .map((tool) => ({ tool, score: scores.get(tool.name) || 0 }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name));

  // 注册表中所有已知工具若都没有路由规则，仍提供一个稳定、受权限约束的最小回退，
  // 避免接入期因为漏配 metadata 让 Planner 完全无工具可用。
  const candidates = ranked.length
    ? ranked
    : eligibleTools
        .map((tool) => ({ tool, score: 0 }))
        .sort((left, right) => left.tool.name.localeCompare(right.tool.name));

  const limit = normalizeMaxTools(maxTools);
  return candidates.slice(0, limit).map((candidate) => candidate.tool);
}
