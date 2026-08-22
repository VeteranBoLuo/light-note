import { getAgentV3CapabilityByToolName } from './capabilityManifest.js';

function activeResultSets(projection = {}) {
  const candidates = Array.isArray(projection?.resultSetCandidates) ? projection.resultSetCandidates : [];
  return (candidates.length ? candidates : projection?.lastResultSet ? [projection.lastResultSet] : []).filter(
    (item) => item?.available === true,
  );
}

function bindingTypes(tool) {
  return new Set(
    (Array.isArray(tool?.resourceBindings) ? tool.resourceBindings : [])
      .flatMap((binding) => (Array.isArray(binding?.refTypes) ? binding.refTypes : [binding?.refType]))
      .map(String)
      .filter(Boolean),
  );
}

/**
 * 判断一个 V3 工具能否消费服务端 ResultSet。
 *
 * 只比较 Manifest 声明、真实资源绑定与结构化引用类型，不读取用户措辞、历史正文、
 * 标题或 URL。具体选择哪一组 ResultSet 仍由 TurnSpec selector 与会话解析器共同裁决。
 */
export function canToolConsumeAgentV3ResultSet(tool, discourseProjection = {}) {
  const capability = getAgentV3CapabilityByToolName(tool?.name);
  const resultSets = activeResultSets(discourseProjection);
  if (!capability?.acceptedInputKinds?.includes('last_result_refs') || !resultSets.length) return false;

  const refTypes = new Set(
    resultSets
      .flatMap((item) => item.refTypes || [])
      .map(String)
      .filter(Boolean),
  );
  const domains = new Set(
    resultSets
      .flatMap((item) => item.domains || [])
      .map(String)
      .filter(Boolean),
  );
  const declaredBindingTypes = bindingTypes(tool);
  if ([...declaredBindingTypes].some((type) => refTypes.has(type))) return true;
  return capability.domains.some((domain) => domains.has(domain) || refTypes.has(domain));
}

export const __testing = Object.freeze({ activeResultSets, bindingTypes });
