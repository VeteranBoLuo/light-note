const VALID_CAPABILITY_STATUSES = new Set(['enabled', 'planned', 'forbidden']);
const VALID_RISKS = new Set(['low', 'medium', 'high']);
const VALID_CONFIRMATION_POLICIES = new Set(['default', 'always']);
const SEMANTIC_READ_CAPABILITY_PREFIX = 'read.';

function defineCapability(input) {
  const capability = {
    operations: [],
    resources: [],
    actionPatterns: [],
    unlessPatterns: [],
    operationPatterns: [],
    resourcePatterns: [],
    ...input,
  };
  if (!capability.id || !VALID_CAPABILITY_STATUSES.has(capability.status)) {
    throw new Error(`Agent 能力定义无效：${capability.id || 'unknown'}`);
  }
  if (capability.status === 'enabled') {
    if (!capability.toolName) throw new Error(`已启用 Agent 能力 ${capability.id} 缺少 toolName`);
    if (!VALID_RISKS.has(capability.riskLevel)) {
      throw new Error(`已启用 Agent 能力 ${capability.id} 缺少有效 riskLevel`);
    }
    if (!VALID_CONFIRMATION_POLICIES.has(capability.confirmationPolicy)) {
      throw new Error(`已启用 Agent 能力 ${capability.id} 缺少有效 confirmationPolicy`);
    }
  } else if (capability.toolName) {
    throw new Error(`未启用 Agent 能力 ${capability.id} 不能绑定可执行工具`);
  }
  return Object.freeze({
    ...capability,
    operations: Object.freeze([...capability.operations]),
    resources: Object.freeze([...capability.resources]),
    actionPatterns: Object.freeze([...capability.actionPatterns]),
    unlessPatterns: Object.freeze([...capability.unlessPatterns]),
    operationPatterns: Object.freeze([...capability.operationPatterns]),
    resourcePatterns: Object.freeze([...capability.resourcePatterns]),
    labels: Object.freeze({ ...(capability.labels || {}) }),
    guidance: Object.freeze({ ...(capability.guidance || {}) }),
  });
}

const CREATE_PATTERN = /(?:创建|新建|新增|添加|写入|收藏|保存|上传|create|add|save|upload|bookmark)/i;
const UPDATE_PATTERN =
  /(?:修改|更新|编辑|重命名|改名|移动|归档|置顶|取消置顶|关联|解绑|替换|整理|设置|更改|update|edit|rename|move|archive|pin|link|replace|set)/i;
const DELETE_PATTERN = /(?:删除|删掉|移除|清除|delete|remove)/i;
const RESTORE_PATTERN = /(?:恢复|还原|重新打开|restore|recover|reopen)/i;

/**
 * Agent 写能力的唯一产品注册表。
 *
 * - enabled：已有服务端工具，只能通过确认协议执行；
 * - planned：产品上可以考虑，但当前没有任何可执行工具；
 * - forbidden：即使模型提出也不允许由 Agent 执行。
 *
 * 工具风险与确认策略以此处为权威来源，toolPolicy 会校验工具文件里的声明与这里一致。
 */
export const AGENT_ACTION_CAPABILITIES = Object.freeze([
  defineCapability({
    id: 'note.create',
    status: 'enabled',
    toolName: 'create_note',
    operations: ['create'],
    resources: ['note'],
    riskLevel: 'low',
    confirmationPolicy: 'default',
    labels: { zh: '创建笔记', en: 'create a note' },
    actionPatterns: [
      /(?:创建|新建|写|起草|生成).{0,12}(?:图片)?(?:笔记|文档)|(?:图片)?(?:笔记|文档).{0,12}(?:创建|新建|写|生成)/i,
      /(?:create|draft|write).{0,20}(?:note|document)|(?:note|document).{0,20}(?:create|draft)/i,
    ],
    unlessPatterns: [/(?:图片笔记|图文笔记|image\s+note)/i],
    operationPatterns: [CREATE_PATTERN],
    resourcePatterns: [/(?:笔记|文档|note|document)/i],
  }),
  defineCapability({
    id: 'note.create_image',
    status: 'enabled',
    toolName: 'create_image_note',
    operations: ['create'],
    resources: ['note', 'file'],
    riskLevel: 'low',
    confirmationPolicy: 'default',
    labels: { zh: '创建图片笔记', en: 'create an image note' },
    actionPatterns: [
      /(?:创建|新建|生成).{0,12}(?:图片笔记|图文笔记)|(?:图片笔记|图文笔记).{0,12}(?:创建|新建|生成)/i,
      /(?:create|make).{0,20}(?:image|picture)\s+note|(?:image|picture)\s+note.{0,20}(?:create|make)/i,
    ],
    operationPatterns: [CREATE_PATTERN],
    resourcePatterns: [/(?:图片笔记|图文笔记|image\s+note|picture\s+note)/i],
  }),
  defineCapability({
    id: 'cloud.attachment.save',
    status: 'enabled',
    toolName: 'save_attachment_to_cloud',
    operations: ['save', 'upload'],
    resources: ['file'],
    riskLevel: 'low',
    confirmationPolicy: 'default',
    labels: { zh: '保存附件到云空间', en: 'save an attachment to cloud storage' },
    actionPatterns: [
      /(?:保存|上传).{0,16}(?:附件|文件|图片).{0,12}(?:云空间|文件夹)|(?:附件|文件|图片).{0,12}(?:保存|上传).{0,12}(?:云空间|文件夹)/i,
      /(?:save|upload).{0,24}(?:attachment|file|image).{0,20}(?:cloud|folder)/i,
    ],
    operationPatterns: [/(?:保存|上传|save|upload)/i],
    resourcePatterns: [/(?:附件|文件|图片|云空间|attachment|file|image|cloud)/i],
  }),
  defineCapability({
    id: 'bookmark.create',
    status: 'enabled',
    toolName: 'create_bookmark',
    operations: ['create'],
    resources: ['bookmark'],
    riskLevel: 'low',
    confirmationPolicy: 'default',
    labels: { zh: '创建书签', en: 'create a bookmark' },
    actionPatterns: [
      /(?:收藏|保存|创建|新增|添加).{0,16}(?:书签|网址|链接)|(?:书签|网址|链接).{0,12}(?:收藏|保存|创建|新增)/i,
      /(?:bookmark|save|add).{0,20}(?:url|link|bookmark)|(?:create|add).{0,20}bookmark/i,
    ],
    operationPatterns: [CREATE_PATTERN],
    resourcePatterns: [/(?:书签|网址|链接|bookmark|url|link)/i],
  }),
  defineCapability({
    id: 'tag.create',
    status: 'enabled',
    toolName: 'add_tag',
    operations: ['create'],
    resources: ['tag'],
    riskLevel: 'low',
    confirmationPolicy: 'default',
    labels: { zh: '创建标签', en: 'create a tag' },
    actionPatterns: [
      /(?:创建|新建|新增).{0,12}标签|标签.{0,12}(?:创建|新建|新增)/i,
      /(?:create|add).{0,16}tag|tag.{0,16}(?:create|add)/i,
    ],
    operationPatterns: [CREATE_PATTERN],
    resourcePatterns: [/(?:标签|tag)/i],
  }),
  defineCapability({
    id: 'trash.restore',
    status: 'enabled',
    toolName: 'restore_trash',
    operations: ['restore'],
    resources: ['trash', 'bookmark', 'note', 'file'],
    riskLevel: 'medium',
    confirmationPolicy: 'always',
    labels: { zh: '恢复回收站内容', en: 'restore deleted content' },
    actionPatterns: [
      /(?:恢复|还原).{0,12}(?:回收站|书签|笔记|文件)|(?:回收站|删除的).{0,12}(?:恢复|还原)/i,
      /(?:restore|recover).{0,20}(?:trash|bookmark|note|file|deleted)/i,
    ],
    operationPatterns: [RESTORE_PATTERN],
    resourcePatterns: [/(?:回收站|删除的|书签|笔记|文件|trash|deleted|bookmark|note|file)/i],
  }),
  defineCapability({
    id: 'knowledge.upsert',
    status: 'enabled',
    toolName: 'write_knowledge_base',
    operations: ['create', 'update'],
    resources: ['knowledge'],
    riskLevel: 'high',
    confirmationPolicy: 'always',
    labels: { zh: '写入知识库', en: 'write to the knowledge base' },
    actionPatterns: [
      /(?:写入|新增|更新).{0,16}(?:知识库|帮助中心)|(?:知识库|帮助中心).{0,16}(?:写入|新增|更新)/i,
      /(?:write|add|update).{0,20}(?:knowledge\s+base|help\s+center)/i,
    ],
    operationPatterns: [CREATE_PATTERN, UPDATE_PATTERN],
    resourcePatterns: [/(?:知识库|帮助中心|knowledge\s+base|help\s+center)/i],
  }),
  defineCapability({
    id: 'todo.status.set',
    status: 'enabled',
    toolName: 'set_todo_status',
    operations: ['complete', 'reopen'],
    resources: ['todo'],
    riskLevel: 'low',
    confirmationPolicy: 'always',
    labels: { zh: '修改待办状态', en: 'change a todo status' },
    actionPatterns: [
      /(?:完成|未完成|重新打开|恢复).{0,16}(?:待办|任务)|(?:待办|任务).{0,16}(?:完成|未完成|重新打开|恢复)/i,
      /(?:complete|reopen|mark).{0,20}(?:todo|task)|(?:todo|task).{0,20}(?:complete|reopen)/i,
    ],
    operationPatterns: [/(?:完成|未完成|重新打开|complete|reopen|mark)/i],
    resourcePatterns: [/(?:待办|任务|todo|task)/i],
  }),

  // 以下能力只有产品声明，没有可执行工具。命中后必须确定性告知“未执行”，不能交给模型自由回答。
  defineCapability({
    id: 'note.delete',
    status: 'planned',
    operations: ['delete'],
    resources: ['note'],
    labels: { zh: '删除笔记', en: 'delete a note' },
    guidance: {
      zh: '你可以前往笔记库手动删除；删除后的笔记会进入回收站。',
      en: 'You can delete it manually from the note library; deleted notes are moved to Trash.',
    },
    operationPatterns: [DELETE_PATTERN],
    resourcePatterns: [/(?:笔记|文档|note|document)/i],
  }),
  defineCapability({
    id: 'bookmark.delete',
    status: 'planned',
    operations: ['delete'],
    resources: ['bookmark'],
    labels: { zh: '删除书签', en: 'delete a bookmark' },
    guidance: {
      zh: '你可以前往书签页手动删除；删除后的书签会进入回收站。',
      en: 'You can delete it manually from Bookmarks; deleted bookmarks are moved to Trash.',
    },
    operationPatterns: [DELETE_PATTERN],
    resourcePatterns: [/(?:书签|收藏|网址|链接|bookmark|favorite|url|link)/i],
  }),
  defineCapability({
    id: 'file.delete',
    status: 'planned',
    operations: ['delete'],
    resources: ['file'],
    labels: { zh: '删除文件', en: 'delete a file' },
    guidance: {
      zh: '你可以前往云空间手动删除；删除后的文件会进入回收站。',
      en: 'You can delete it manually from Cloud Space; deleted files are moved to Trash.',
    },
    operationPatterns: [DELETE_PATTERN],
    resourcePatterns: [/(?:文件|文件夹|云空间|file|folder|cloud)/i],
  }),
  defineCapability({
    id: 'tag.delete',
    status: 'planned',
    operations: ['delete'],
    resources: ['tag'],
    labels: { zh: '删除标签', en: 'delete a tag' },
    operationPatterns: [DELETE_PATTERN],
    resourcePatterns: [/(?:标签|tag)/i],
  }),
  defineCapability({
    id: 'todo.delete',
    status: 'planned',
    operations: ['delete'],
    resources: ['todo'],
    labels: { zh: '删除待办', en: 'delete a todo' },
    operationPatterns: [DELETE_PATTERN],
    resourcePatterns: [/(?:待办|任务|提醒|todo|task|reminder)/i],
  }),
  defineCapability({
    id: 'note.update',
    status: 'planned',
    operations: ['update'],
    resources: ['note'],
    labels: { zh: '修改笔记', en: 'update a note' },
    operationPatterns: [UPDATE_PATTERN],
    resourcePatterns: [/(?:笔记|文档|note|document)/i],
  }),
  defineCapability({
    id: 'bookmark.update',
    status: 'planned',
    operations: ['update'],
    resources: ['bookmark'],
    labels: { zh: '修改书签', en: 'update a bookmark' },
    operationPatterns: [UPDATE_PATTERN],
    resourcePatterns: [/(?:书签|收藏|网址|链接|bookmark|favorite|url|link)/i],
  }),
  defineCapability({
    id: 'file.manage',
    status: 'planned',
    operations: ['create', 'update', 'move'],
    resources: ['file'],
    labels: { zh: '整理云空间文件', en: 'manage cloud files' },
    operationPatterns: [UPDATE_PATTERN, /(?:新建|创建).{0,8}(?:文件夹)|(?:create|make).{0,12}folder/i],
    resourcePatterns: [/(?:文件|文件夹|云空间|file|folder|cloud)/i],
  }),
  defineCapability({
    id: 'tag.assign',
    status: 'planned',
    operations: ['update'],
    resources: ['tag', 'bookmark', 'note', 'file'],
    labels: { zh: '调整资源标签', en: 'change resource tags' },
    operationPatterns: [/(?:添加|移除|替换|修改|整理|关联|解绑|add|remove|replace|change|assign|unlink)/i],
    resourcePatterns: [/(?:标签|tag)/i],
  }),
  defineCapability({
    id: 'todo.manage',
    status: 'planned',
    operations: ['create', 'update'],
    resources: ['todo'],
    labels: { zh: '创建或修改待办', en: 'create or update a todo' },
    operationPatterns: [CREATE_PATTERN, UPDATE_PATTERN],
    resourcePatterns: [/(?:待办|任务|提醒|todo|task|reminder)/i],
  }),
  defineCapability({
    id: 'inbox.manage',
    status: 'planned',
    operations: ['create', 'update'],
    resources: ['inbox'],
    labels: { zh: '修改待整理内容', en: 'change inbox items' },
    operationPatterns: [CREATE_PATTERN, UPDATE_PATTERN, /(?:完成|清理|处理|complete|clear|process)/i],
    resourcePatterns: [/(?:待整理|收集箱|inbox)/i],
  }),

  // 安全与数据完整性边界：这些动作不开放给 Agent，也不能通过后续“未知工具”绕过。
  defineCapability({
    id: 'data.permanent_delete',
    status: 'forbidden',
    operations: ['delete'],
    resources: ['all'],
    labels: { zh: '永久删除或批量清空数据', en: 'permanently delete or clear data' },
    guidance: {
      zh: '永久删除和批量清空必须由你在对应安全页面亲自操作。',
      en: 'Permanent deletion and bulk clearing must be performed manually from the relevant security page.',
    },
    actionPatterns: [
      /(?:永久|彻底|不可恢复).{0,20}(?:删除|清空|销毁)|(?:清空|删除).{0,12}(?:全部|所有).{0,12}(?:笔记|书签|文件|标签|待办|数据|回收站)/i,
      /(?:permanently|irreversibly).{0,20}(?:delete|erase)|(?:delete|clear).{0,20}(?:all|every).{0,20}(?:note|bookmark|file|tag|todo|data|trash)/i,
    ],
  }),
  defineCapability({
    id: 'account.security.manage',
    status: 'forbidden',
    operations: ['update', 'delete'],
    resources: ['account', 'security'],
    labels: { zh: '修改账号或安全设置', en: 'change account or security settings' },
    guidance: {
      zh: '账号、安全凭据和设备控制必须由你在账号与安全页面亲自操作。',
      en: 'Account credentials and device controls must be changed manually from Account & Security.',
    },
    actionPatterns: [
      /(?:修改|更换|重置|删除|注销|下线|踢出|移除).{0,16}(?:密码|邮箱|账号|账户|登录设备|权限|角色)|(?:密码|邮箱|账号|账户|登录设备|权限|角色).{0,16}(?:修改|更换|重置|删除|注销|下线|移除)/i,
      /(?:change|reset|delete|remove|sign\s*out).{0,20}(?:password|email|account|device|permission|role)/i,
    ],
  }),
  defineCapability({
    id: 'growth.integrity.manage',
    status: 'forbidden',
    operations: ['update'],
    resources: ['growth'],
    labels: { zh: '修改成长或奖励数据', en: 'change growth or reward data' },
    guidance: {
      zh: '积分、经验、等级、签到和奖励由系统规则计算，AI 不能修改。',
      en: 'Points, experience, levels, check-ins, and rewards are system-calculated and cannot be changed by AI.',
    },
    actionPatterns: [
      /(?:增加|减少|修改|重置|补发|领取|刷|调整).{0,16}(?:积分|经验|等级|签到|抽奖|奖励|额度)|(?:积分|经验|等级|签到|抽奖|奖励|额度).{0,16}(?:增加|减少|修改|重置|补发|领取|调整)/i,
      /(?:increase|decrease|change|reset|grant|claim).{0,20}(?:points|experience|level|check-in|lottery|reward|quota)/i,
    ],
  }),
  defineCapability({
    id: 'admin.mutation',
    status: 'forbidden',
    operations: ['update', 'delete'],
    resources: ['user', 'security'],
    labels: { zh: '修改平台用户或管理数据', en: 'change platform users or administrative data' },
    guidance: {
      zh: '平台用户、角色、封禁和安全策略只能在受控后台中人工操作。',
      en: 'Platform users, roles, bans, and security policies must be managed manually in the admin console.',
    },
    actionPatterns: [
      /(?:删除|封禁|解封|禁用|启用|修改|授予|撤销).{0,16}(?:用户|角色|管理员|安全策略)|(?:用户|角色|管理员|安全策略).{0,16}(?:删除|封禁|解封|禁用|启用|修改|授予|撤销)/i,
      /(?:delete|ban|unban|disable|enable|change|grant|revoke).{0,20}(?:user|role|admin|security\s+policy)/i,
    ],
  }),
]);

const CAPABILITY_BY_ID = new Map(AGENT_ACTION_CAPABILITIES.map((item) => [item.id, item]));
const CAPABILITY_BY_TOOL = new Map(
  AGENT_ACTION_CAPABILITIES.filter((item) => item.status === 'enabled').map((item) => [item.toolName, item]),
);

if (CAPABILITY_BY_ID.size !== AGENT_ACTION_CAPABILITIES.length) {
  throw new Error('Agent 能力注册表存在重复 id');
}
if (CAPABILITY_BY_TOOL.size !== AGENT_ACTION_CAPABILITIES.filter((item) => item.status === 'enabled').length) {
  throw new Error('Agent 能力注册表存在重复 toolName');
}

export const ENABLED_AGENT_ACTION_CAPABILITIES = Object.freeze(
  AGENT_ACTION_CAPABILITIES.filter((item) => item.status === 'enabled'),
);

export const ROUTED_AGENT_WRITE_TOOL_NAMES = Object.freeze(
  ENABLED_AGENT_ACTION_CAPABILITIES.map((item) => item.toolName),
);

export function getAgentCapabilityById(id) {
  return CAPABILITY_BY_ID.get(String(id || '')) || null;
}

export function getAgentCapabilityByToolName(toolName) {
  return CAPABILITY_BY_TOOL.get(String(toolName || '')) || null;
}

export function getSemanticCapabilityIdForTool(tool) {
  if (!tool?.name) return '';
  if (tool.isWrite === true) return getAgentCapabilityByToolName(tool.name)?.id || '';
  return `${SEMANTIC_READ_CAPABILITY_PREFIX}${tool.name}`;
}

/**
 * 构建供 Semantic Planner 理解产品边界的能力目录。
 *
 * 目录只描述“用户想做什么”以及服务端当前能否提供该能力；它不授予权限，
 * 也不直接执行工具。真正的角色、owner、readonly/maintain 与确认策略仍由
 * toolPolicy / confirmationStore 在服务端强制校验。
 */
export function buildAgentSemanticCapabilityCatalog(tools, { availableToolNames } = {}) {
  const list = Array.isArray(tools) ? tools : [...(tools?.values?.() || [])];
  const available = availableToolNames instanceof Set ? availableToolNames : new Set(list.map((tool) => tool?.name));
  const entries = [];
  const includedActionCapabilities = new Set();

  for (const tool of list) {
    if (!tool?.name) continue;
    const actionCapability = tool.isWrite === true ? getAgentCapabilityByToolName(tool.name) : null;
    const capabilityId = actionCapability?.id || getSemanticCapabilityIdForTool(tool);
    if (!capabilityId) continue;
    if (actionCapability) includedActionCapabilities.add(actionCapability.id);
    entries.push(
      Object.freeze({
        id: capabilityId,
        effect: tool.isWrite === true ? 'write' : 'read',
        status: available.has(tool.name) ? 'enabled' : 'unavailable',
        toolNames: Object.freeze(available.has(tool.name) ? [tool.name] : []),
        description: String(tool.description || actionCapability?.labels?.zh || tool.name).trim(),
        label: String(actionCapability?.labels?.zh || tool.description || tool.name).trim(),
        guidance: String(actionCapability?.guidance?.zh || '').trim(),
        labels: Object.freeze({
          zh: String(actionCapability?.labels?.zh || tool.description || tool.name).trim(),
          en: String(actionCapability?.labels?.en || tool.description || tool.name).trim(),
        }),
        guidanceByLocale: Object.freeze({
          zh: String(actionCapability?.guidance?.zh || '').trim(),
          en: String(actionCapability?.guidance?.en || '').trim(),
        }),
      }),
    );
  }

  for (const capability of AGENT_ACTION_CAPABILITIES) {
    if (includedActionCapabilities.has(capability.id)) continue;
    entries.push(
      Object.freeze({
        id: capability.id,
        effect: 'write',
        status: capability.status,
        toolNames: Object.freeze([]),
        description: String(capability.labels?.zh || capability.id).trim(),
        label: String(capability.labels?.zh || capability.id).trim(),
        guidance: String(capability.guidance?.zh || '').trim(),
        labels: Object.freeze({
          zh: String(capability.labels?.zh || capability.id).trim(),
          en: String(capability.labels?.en || capability.id).trim(),
        }),
        guidanceByLocale: Object.freeze({
          zh: String(capability.guidance?.zh || '').trim(),
          en: String(capability.guidance?.en || '').trim(),
        }),
      }),
    );
  }

  const seen = new Set();
  const unique = entries.filter((entry) => {
    if (seen.has(entry.id)) throw new Error(`Agent 语义能力目录存在重复 id：${entry.id}`);
    seen.add(entry.id);
    return true;
  });
  return Object.freeze(unique);
}

export function matchesAgentCapability(capability, message, contextTypes = []) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (capability.unlessPatterns.some((pattern) => pattern.test(text))) return false;
  if (capability.actionPatterns.some((pattern) => pattern.test(text))) return true;
  // 已启用工具必须命中能力自己的窄动作模式，不能仅凭“添加 + 标签”等通用词扩大可执行范围。
  // operation/resource 的高召回组合只用于 planned/forbidden 分流和失败关闭。
  if (capability.status === 'enabled') return false;
  if (!capability.operationPatterns.length || !capability.operationPatterns.some((pattern) => pattern.test(text))) {
    return false;
  }
  if (capability.resourcePatterns.some((pattern) => pattern.test(text))) return true;
  const normalizedContexts = new Set(
    (Array.isArray(contextTypes) ? contextTypes : []).map((item) =>
      String(item || '')
        .trim()
        .toLowerCase(),
    ),
  );
  return capability.resources.some((resource) => normalizedContexts.has(resource));
}

export function validateAgentCapabilityToolContract(tools) {
  const errors = [];
  const list = Array.isArray(tools) ? tools : [...(tools?.values?.() || [])];
  const writeTools = list.filter((tool) => tool?.isWrite === true);
  const writeNames = new Set(writeTools.map((tool) => tool.name));

  for (const tool of writeTools) {
    const capability = getAgentCapabilityByToolName(tool.name);
    if (!capability) {
      errors.push(`写工具 ${tool.name} 没有 enabled 能力`);
      continue;
    }
    if (tool.riskLevel && tool.riskLevel !== capability.riskLevel) {
      errors.push(`写工具 ${tool.name} 的 riskLevel 与能力注册表不一致`);
    }
    if (tool.confirmationPolicy && tool.confirmationPolicy !== capability.confirmationPolicy) {
      errors.push(`写工具 ${tool.name} 的 confirmationPolicy 与能力注册表不一致`);
    }
  }

  for (const capability of ENABLED_AGENT_ACTION_CAPABILITIES) {
    if (!writeNames.has(capability.toolName)) {
      errors.push(`enabled 能力 ${capability.id} 对应的写工具 ${capability.toolName} 未注册`);
    }
  }
  return errors;
}
