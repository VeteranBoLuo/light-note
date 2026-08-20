const MAX_CONTEXT_REFS = 12;
const MAX_ATTACHMENT_IDS = 5;
const MAX_RESOURCE_VALUES = 8;
const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export const RESOURCE_BINDING_ERROR_CODES = Object.freeze([
  'TOOL_RESOURCE_CONTEXT_REQUIRED',
  'TOOL_RESOURCE_SELECTION_REQUIRED',
  'TOOL_RESOURCE_SELECTION_INVALID',
  'TOOL_RESOURCE_VALUE_UNAVAILABLE',
]);

function normalizedRef(item) {
  const type = String(item?.type || '')
    .trim()
    .toLowerCase();
  const id = String(item?.id || '').trim();
  if (!RESOURCE_TYPE_PATTERN.test(type) || !id || id.length > 255) return null;
  return { type, id };
}

function uniqueRefs(items, limit) {
  const seen = new Set();
  const refs = [];
  for (const item of Array.isArray(items) ? items : []) {
    const ref = normalizedRef(item);
    const key = ref ? `${ref.type}:${ref.id}` : '';
    if (!ref || seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
    if (refs.length >= limit) break;
  }
  return refs;
}

function uniqueAttachmentIds(items) {
  return [...new Set((Array.isArray(items) ? items : []).map(String))]
    .map((item) => item.trim())
    .filter((item) => item && item.length <= 255)
    .slice(0, MAX_ATTACHMENT_IDS);
}

function scalarResourceValue(value) {
  if (typeof value === 'string') return value.length <= 8_000 ? value : value.slice(0, 8_000);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  return undefined;
}

function resourceKey(ref) {
  return `${ref.type}:${ref.id}`;
}

export function normalizeAuthoritativeExecutionContext(value = {}) {
  const contextRefs = uniqueRefs(value?.contextRefs, MAX_CONTEXT_REFS);
  const attachmentIds = uniqueAttachmentIds(value?.attachmentIds);
  const allowedKeys = new Set(contextRefs.map(resourceKey));
  for (const id of attachmentIds) allowedKeys.add(`attachment:${id}`);

  const resourcesByKey = new Map();
  for (const item of Array.isArray(value?.resources) ? value.resources : []) {
    const ref = normalizedRef(item);
    const key = ref ? resourceKey(ref) : '';
    if (!ref || !allowedKeys.has(key) || resourcesByKey.has(key)) continue;
    const values = {};
    for (const [field, rawValue] of Object.entries(item?.values || {}).slice(0, MAX_RESOURCE_VALUES)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(field)) continue;
      const normalizedValue = scalarResourceValue(rawValue);
      if (normalizedValue !== undefined) values[field] = normalizedValue;
    }
    resourcesByKey.set(key, Object.freeze({ ...ref, values: Object.freeze(values) }));
  }

  // 附件 ID 本身就是服务端校验后的权威字段。把它投影成普通资源后，附件工具与
  // 书签、文件等上下文使用同一套绑定协议，不再维护 attachmentId 特判。
  for (const id of attachmentIds) {
    const key = `attachment:${id}`;
    if (!resourcesByKey.has(key)) {
      resourcesByKey.set(key, Object.freeze({ type: 'attachment', id, values: Object.freeze({ id }) }));
    }
  }

  return Object.freeze({
    contextRefs: Object.freeze(contextRefs),
    attachmentIds: Object.freeze(attachmentIds),
    resources: Object.freeze([...resourcesByKey.values()]),
  });
}

export function buildAuthoritativeExecutionContext({ contextRefs, attachmentIds, entities, candidateTools } = {}) {
  const requestedFields = new Map();
  for (const tool of Array.isArray(candidateTools) ? candidateTools : []) {
    for (const binding of Array.isArray(tool?.resourceBindings) ? tool.resourceBindings : []) {
      const fields = requestedFields.get(binding.refType) || new Set();
      fields.add(binding.sourceField);
      requestedFields.set(binding.refType, fields);
    }
  }
  const resources = [];
  for (const entity of Array.isArray(entities) ? entities : []) {
    const ref = normalizedRef(entity);
    const fields = ref ? requestedFields.get(ref.type) : null;
    if (!ref || !fields?.size) continue;
    const values = {};
    for (const field of fields) {
      const value = scalarResourceValue(entity?.[field]);
      if (value !== undefined) values[field] = value;
    }
    resources.push({ ...ref, values });
  }
  return normalizeAuthoritativeExecutionContext({ contextRefs, attachmentIds, resources });
}

function hasResourceBindingValue(resource, binding) {
  const value = resource?.values?.[binding.sourceField];
  return value !== undefined && !(typeof value === 'string' && !value.trim());
}

function bindingCandidates(binding, executionContext) {
  return executionContext.resources.filter(
    (resource) => resource.type === binding.refType && hasResourceBindingValue(resource, binding),
  );
}

export function projectPlannerExecutionContext(value = {}, candidateTools = []) {
  const executionContext = normalizeAuthoritativeExecutionContext(value);
  const resourceBindings = [];
  for (const tool of Array.isArray(candidateTools) ? candidateTools : []) {
    for (const binding of Array.isArray(tool?.resourceBindings) ? tool.resourceBindings : []) {
      const refs = bindingCandidates(binding, executionContext).map(({ type, id }) => ({ type, id }));
      if (refs.length) resourceBindings.push({ toolName: tool.name, argument: binding.argument, refs });
    }
  }
  return Object.freeze({
    contextRefs: executionContext.contextRefs,
    attachmentIds: executionContext.attachmentIds,
    ...(resourceBindings.length ? { resourceBindings: Object.freeze(resourceBindings) } : {}),
  });
}

export function plannerArgumentsSchema(tool, executionContext) {
  const schema = tool?.parameters || { type: 'object', additionalProperties: false };
  const bindableArguments = new Set(
    (Array.isArray(tool?.resourceBindings) ? tool.resourceBindings : [])
      .filter((binding) => bindingCandidates(binding, executionContext).length > 0)
      .map((binding) => binding.argument),
  );
  if (!bindableArguments.size) return schema;
  return {
    ...schema,
    required: (Array.isArray(schema.required) ? schema.required : []).filter(
      (argument) => !bindableArguments.has(String(argument)),
    ),
  };
}

export function plannerArgumentBindingsSchema(tool, executionContext) {
  const properties = {};
  const required = [];
  for (const binding of Array.isArray(tool?.resourceBindings) ? tool.resourceBindings : []) {
    const candidates = bindingCandidates(binding, executionContext);
    if (!candidates.length) continue;
    properties[binding.argument] = {
      oneOf: candidates.map(({ type, id }) => ({
        type: 'object',
        additionalProperties: false,
        properties: { type: { type: 'string', enum: [type] }, id: { type: 'string', enum: [id] } },
        required: ['type', 'id'],
      })),
    };
    if (candidates.length > 1) required.push(binding.argument);
  }
  if (!Object.keys(properties).length) return null;
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  };
}

function resourceBindingError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function bindAuthoritativeResourceArguments({
  tool,
  args,
  argumentBindings,
  executionContext: rawExecutionContext,
} = {}) {
  const executionContext = normalizeAuthoritativeExecutionContext(rawExecutionContext);
  const bindings = Array.isArray(tool?.resourceBindings) ? tool.resourceBindings : [];
  if (!bindings.length) return args;
  if (
    argumentBindings != null &&
    (!argumentBindings || typeof argumentBindings !== 'object' || Array.isArray(argumentBindings))
  ) {
    throw resourceBindingError('TOOL_RESOURCE_SELECTION_INVALID', '资源绑定选择格式无效。');
  }
  const declaredArguments = new Set(bindings.map((binding) => binding.argument));
  const unknownBinding = Object.keys(argumentBindings || {}).find((argument) => !declaredArguments.has(argument));
  if (unknownBinding) {
    throw resourceBindingError('TOOL_RESOURCE_SELECTION_INVALID', '资源绑定选择不属于当前工具。');
  }

  let boundArgs = { ...(args || {}) };
  for (const binding of bindings) {
    const matchingResources = executionContext.resources.filter((resource) => resource.type === binding.refType);
    const candidates = bindingCandidates(binding, executionContext);
    const requestedRef = argumentBindings?.[binding.argument];
    let selected = null;
    if (requestedRef != null) {
      const ref = normalizedRef(requestedRef);
      selected = ref
        ? matchingResources.find((resource) => resource.type === ref.type && resource.id === ref.id) || null
        : null;
      if (!selected) {
        throw resourceBindingError('TOOL_RESOURCE_SELECTION_INVALID', '所选资源不属于本轮已校验上下文。');
      }
      if (!hasResourceBindingValue(selected, binding)) {
        throw resourceBindingError('TOOL_RESOURCE_VALUE_UNAVAILABLE', '所选资源缺少执行所需的可用字段。');
      }
    } else if (candidates.length === 1) {
      selected = candidates[0];
    } else if (candidates.length > 1) {
      throw resourceBindingError('TOOL_RESOURCE_SELECTION_REQUIRED', '本轮存在多个可用资源，请明确选择一个。');
    } else if (matchingResources.length > 0) {
      throw resourceBindingError('TOOL_RESOURCE_VALUE_UNAVAILABLE', '本轮资源缺少执行所需的可用字段。');
    } else if (binding.allowLiteral === true && boundArgs[binding.argument] != null) {
      continue;
    } else {
      throw resourceBindingError('TOOL_RESOURCE_CONTEXT_REQUIRED', '本轮没有可用于该参数的已校验资源。');
    }
    boundArgs = { ...boundArgs, [binding.argument]: selected.values[binding.sourceField] };
  }
  return boundArgs;
}
