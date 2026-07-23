import { normalizeToolArguments } from './toolArguments.js';

const MAX_DEPENDENCY_REFS = 100;
const REF_TYPE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export class AgentDependencyGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AgentDependencyGuardError';
    this.code = code;
    this.status = 400;
  }
}

export function normalizeToolDependencyRefs(rawRefs) {
  const refs = [];
  const seen = new Set();
  for (const raw of (Array.isArray(rawRefs) ? rawRefs : []).slice(0, MAX_DEPENDENCY_REFS)) {
    const type = String(raw?.type || '')
      .trim()
      .toLowerCase();
    const id = String(raw?.id || '').trim();
    if (!REF_TYPE_PATTERN.test(type) || !id || id.length > 128 || /\s/u.test(id)) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(Object.freeze({ type, id }));
  }
  return Object.freeze(refs);
}

/**
 * 将依赖轮的目标参数绑定到真实前置查询返回的结构化引用。
 *
 * 模型只能从工具可见摘要中选择目标，但摘要标题属于不可信用户数据。这里不解析文字，
 * 只接受读取工具直接从权威 raw 结果生成的 dependencyRefs，防止标题中的伪标记或历史 ID
 * 把后续读取或写入引向本轮直接前置查询之外的对象。
 */
export function enforceToolDependencyBindings(tool, args, availableRefs) {
  const bindings = Array.isArray(tool?.dependencyBindings) ? tool.dependencyBindings : [];
  if (!bindings.length) return args;
  const normalizedArgs = normalizeToolArguments(tool, args);
  const refs = normalizeToolDependencyRefs(availableRefs);

  for (const binding of bindings) {
    const argument = String(binding?.argument || '').trim();
    const refType = String(binding?.refType || '')
      .trim()
      .toLowerCase();
    if (!argument || !REF_TYPE_PATTERN.test(refType)) {
      throw new AgentDependencyGuardError(
        'TOOL_DEPENDENCY_CONFIG_INVALID',
        '依赖目标校验配置异常，因此没有生成操作确认。',
      );
    }
    const value = String(normalizedArgs?.[argument] || '').trim();
    if (!value) {
      throw new AgentDependencyGuardError(
        'TOOL_DEPENDENCY_TARGET_REQUIRED',
        tool?.isWrite
          ? '没有从前置查询中取得可核验的目标 ID，因此没有生成操作确认。'
          : '没有从前置查询中取得可核验的目标 ID，因此没有继续读取。',
      );
    }
    const refsOfType = refs.filter((ref) => ref.type === refType);
    if (binding?.requireUnique === true && refsOfType.length > 1) {
      throw new AgentDependencyGuardError(
        'TOOL_DEPENDENCY_TARGET_AMBIGUOUS',
        tool?.isWrite
          ? '前置查询返回了多个可能目标，无法证明模型选择的是用户指定对象，因此没有生成操作确认。'
          : '前置查询返回了多个可能目标，无法证明模型选择的是用户指定对象，因此没有继续读取。',
      );
    }
    if (!refsOfType.some((ref) => ref.id === value)) {
      throw new AgentDependencyGuardError(
        'TOOL_DEPENDENCY_TARGET_MISMATCH',
        tool?.isWrite
          ? '操作目标不属于本轮直接前置查询结果，因此已停止，未修改任何数据。'
          : '读取目标不属于本轮直接前置查询结果，因此已停止，未读取其他数据。',
      );
    }
  }

  return normalizedArgs;
}
