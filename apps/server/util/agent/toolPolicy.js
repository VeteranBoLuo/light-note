import { normalizeToolArguments, prepareToolArguments } from './toolArguments.js';

const VALID_RISKS = new Set(['low', 'medium', 'high']);
const VALID_CONFIRMATION_POLICIES = new Set(['none', 'default', 'always']);
const KNOWN_ADMIN_MODES = new Set(['readonly', 'maintain']);

export class AgentToolPolicyError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AgentToolPolicyError';
    this.code = code;
    this.status = status;
  }
}

export function canonicalAgentRole(role) {
  const value = String(role || 'visitor').toLowerCase();
  // 兼容 20260712 角色迁移前仍可能存在于旧会话/测试夹具中的 admin。
  return value === 'admin' ? 'user' : value;
}

export function closeToolSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const closed = { ...schema };
  if (closed.type === 'object' || closed.properties) {
    closed.type = 'object';
    closed.additionalProperties = false;
    closed.properties = Object.fromEntries(
      Object.entries(closed.properties || {}).map(([key, value]) => [key, closeToolSchema(value)]),
    );
  }
  if (closed.items) closed.items = closeToolSchema(closed.items);
  return closed;
}

export function normalizeRegisteredTool(tool) {
  if (!tool?.name || !tool?.parameters || typeof tool.execute !== 'function' || typeof tool.transform !== 'function') {
    throw new Error(`Agent 工具注册失败：${tool?.name || '未命名工具'} 缺少名称、参数 schema、execute 或 transform`);
  }
  const isWrite = tool.isWrite === true;
  const riskLevel = tool.riskLevel || 'low';
  const confirmationPolicy = tool.confirmationPolicy || (isWrite ? 'always' : 'none');
  if (!VALID_RISKS.has(riskLevel)) throw new Error(`Agent 工具 ${tool.name} 缺少有效 riskLevel`);
  if (!VALID_CONFIRMATION_POLICIES.has(confirmationPolicy)) {
    throw new Error(`Agent 工具 ${tool.name} 缺少有效 confirmationPolicy`);
  }
  if (isWrite && confirmationPolicy === 'none') {
    throw new Error(`Agent 写工具 ${tool.name} 禁止关闭确认`);
  }
  const allowedRoles = (tool.allowedRoles || (tool.requireRoot ? ['root'] : ['visitor', 'user', 'test', 'root']))
    .map(canonicalAgentRole)
    .filter((role, index, roles) => role && roles.indexOf(role) === index);
  return {
    ...tool,
    category: tool.category || tool.name.split('_').slice(-1)[0] || 'general',
    riskLevel,
    confirmationPolicy,
    timeoutMs: Number(tool.timeoutMs || (isWrite ? 10_000 : 8_000)),
    allowedRoles,
    resultBudget: Number(tool.resultBudget || 6000),
    parameters: closeToolSchema(tool.parameters),
  };
}

export function isToolRoleAllowed(tool, role) {
  const actorRole = canonicalAgentRole(role);
  if (tool?.requireRoot && actorRole !== 'root') return false;
  return !Array.isArray(tool?.allowedRoles) || tool.allowedRoles.map(canonicalAgentRole).includes(actorRole);
}

function fail(code, message, status = 400) {
  throw new AgentToolPolicyError(code, message, status);
}

function valueTypeMatches(value, type) {
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isSafeInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
}

function validateSchema(schema, value, path = 'args') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type && !valueTypeMatches(value, schema.type)) {
    fail('TOOL_ARGUMENTS_INVALID', `${path} 的类型无效。`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    fail('TOOL_ARGUMENTS_INVALID', `${path} 的取值不在允许范围内。`);
  }
  if (typeof value === 'string') {
    if (Number.isFinite(schema.minLength) && value.length < schema.minLength) {
      fail('TOOL_ARGUMENTS_INVALID', `${path} 长度不足。`);
    }
    if (Number.isFinite(schema.maxLength) && value.length > schema.maxLength) {
      fail('TOOL_ARGUMENTS_INVALID', `${path} 长度超过限制。`);
    }
    if (schema.pattern) {
      let pattern;
      try {
        pattern = new RegExp(schema.pattern);
      } catch {
        fail('TOOL_SCHEMA_INVALID', `${path} 的校验规则无效。`, 500);
      }
      if (!pattern.test(value)) fail('TOOL_ARGUMENTS_INVALID', `${path} 格式无效。`);
    }
  }
  if (typeof value === 'number') {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) {
      fail('TOOL_ARGUMENTS_INVALID', `${path} 小于允许值。`);
    }
    if (Number.isFinite(schema.maximum) && value > schema.maximum) {
      fail('TOOL_ARGUMENTS_INVALID', `${path} 大于允许值。`);
    }
  }
  if (schema.type === 'object') {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (value?.[required] == null || value[required] === '') {
        fail('TOOL_ARGUMENTS_INVALID', `${path}.${required} 为必填参数。`);
      }
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value || {}).find((key) => !Object.hasOwn(properties, key));
      if (unknown) fail('TOOL_ARGUMENTS_ADDITIONAL_PROPERTY', `${path}.${unknown} 不是允许的参数。`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (value?.[key] !== undefined) validateSchema(child, value[key], `${path}.${key}`);
    }
  }
  if (schema.type === 'array') {
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) {
      fail('TOOL_ARGUMENTS_INVALID', `${path} 数量不足。`);
    }
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) {
      fail('TOOL_ARGUMENTS_INVALID', `${path} 数量超过限制。`);
    }
    value.forEach((item, index) => validateSchema(schema.items, item, `${path}[${index}]`));
  }
}

function assertRawProperties(tool, args) {
  const schemaKeys = Object.keys(tool.parameters?.properties || {});
  const aliases = Array.isArray(tool.argumentAliases) ? tool.argumentAliases : [];
  const allowed = new Set([...schemaKeys, ...aliases]);
  const unknown = Object.keys(args).find((key) => !allowed.has(key));
  if (unknown) fail('TOOL_ARGUMENTS_ADDITIONAL_PROPERTY', `args.${unknown} 不是允许的参数。`);
}

function assertActorSubjectBoundary(context, isWrite) {
  const request = context.request || {};
  const adminContext = request.adminContext || null;
  const actorId = String(context.billingUserId || context.userId || '');
  const subjectId = String(context.userId || '');
  const actorRole = canonicalAgentRole(context.billingUserRole || context.userRole);

  if (adminContext) {
    if (actorRole !== 'root' || !actorId || !subjectId || actorId === subjectId) {
      fail('TOOL_ACTOR_SUBJECT_FORBIDDEN', '管理员资源上下文与真实操作者不匹配。', 403);
    }
    if (!KNOWN_ADMIN_MODES.has(adminContext.mode)) {
      fail('TOOL_ADMIN_MODE_INVALID', '管理员资源上下文模式无效。', 403);
    }
    if (isWrite && adminContext.mode !== 'maintain') {
      fail('TOOL_CONFIRMATION_FORBIDDEN', '只读代管模式不能准备或执行写操作。', 403);
    }
    return { actorId, subjectId, actorRole, adminMode: adminContext.mode };
  }

  if (context.billingUserId && context.userId && actorId !== subjectId) {
    fail('TOOL_ACTOR_SUBJECT_FORBIDDEN', '普通会话的资源账号与计费账号不匹配。', 403);
  }
  return { actorId, subjectId, actorRole, adminMode: null };
}

/**
 * Agent 工具的唯一运行时策略入口。模型调用、快捷动作和确认执行都必须经过此函数；
 * `trustedPreparedArgs` 只用于服务器保存的确认参数或已经通过本函数检查的内部参数。
 */
export async function enforceToolPolicy({
  registry,
  toolName,
  args = {},
  context = {},
  allowedToolNames,
  phase = 'execute',
  confirmed = false,
  requireDirectAction = false,
  trustedPreparedArgs = false,
  prepare = true,
}) {
  const tool = registry?.get?.(toolName);
  if (!tool) fail('TOOL_NOT_FOUND', '请求的工具不存在。', 404);
  if (allowedToolNames && !allowedToolNames.has(toolName)) {
    fail('TOOL_NOT_ALLOWED', '该工具不在本轮允许范围内。', 403);
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    fail('TOOL_ARGUMENTS_INVALID', '工具参数必须是对象。');
  }

  const boundary = assertActorSubjectBoundary(context, tool.isWrite === true);
  if (!isToolRoleAllowed(tool, boundary.actorRole)) {
    fail('TOOL_FORBIDDEN', '当前账号无权使用该工具。', 403);
  }
  if (requireDirectAction && tool.directAction !== true) {
    fail('TOOL_DIRECT_ACTION_NOT_ALLOWED', '该操作不支持快捷确认。');
  }
  if (requireDirectAction && !tool.isWrite) {
    fail('TOOL_DIRECT_ACTION_NOT_ALLOWED', '快捷确认仅支持需要确认的写操作。');
  }
  if (args.user != null && String(args.user).trim()) {
    if (boundary.actorRole !== 'root' || boundary.adminMode) {
      fail('TOOL_TARGET_USER_FORBIDDEN', '当前上下文不能指定其他用户。', 403);
    }
  }
  if (
    tool.isWrite &&
    !context.allowVisitorMaintenance &&
    (canonicalAgentRole(context.userRole) === 'visitor' || !context.userId || context.userId === 'visitor')
  ) {
    fail('GUEST_FORBIDDEN', '预览模式仅支持浏览查看，写操作需要先登录注册。', 403);
  }
  if (tool.isWrite && phase === 'execute' && !confirmed) {
    fail('TOOL_CONFIRMATION_REQUIRED', '该操作必须先由用户确认。', 409);
  }

  if (!trustedPreparedArgs) assertRawProperties(tool, args);
  const normalized = normalizeToolArguments(tool, args);
  const schemaValue = trustedPreparedArgs
    ? Object.fromEntries(
        Object.keys(tool.parameters?.properties || {})
          .filter((key) => normalized[key] !== undefined)
          .map((key) => [key, normalized[key]]),
      )
    : normalized;
  validateSchema(tool.parameters, schemaValue);
  const preparedArgs = prepare
    ? await prepareToolArguments(tool, normalized, context)
    : trustedPreparedArgs
      ? args
      : normalized;

  return {
    tool,
    args: preparedArgs,
    actorRole: boundary.actorRole,
    subjectId: boundary.subjectId,
    requiresConfirmation: tool.isWrite === true,
    riskLevel: tool.riskLevel,
    confirmationPolicy: tool.confirmationPolicy,
  };
}
