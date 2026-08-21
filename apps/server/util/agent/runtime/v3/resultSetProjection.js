function rawResultRefs(result) {
  return [
    ...(Array.isArray(result?.dependencyRefs) ? result.dependencyRefs : []),
    ...(Array.isArray(result?.sources)
      ? result.sources.map((source) => ({
          type: source?.type,
          id: source?.id || source?.resourceId,
        }))
      : []),
  ];
}

/**
 * 把一次真实工具结果投影成可跨轮引用的 ResultSet。
 *
 * 不根据 resultKind 名称、摘要文案或模型输出猜测“这是一个列表”。只有工具真实返回了
 * 稳定引用，或工具的 getDependencyRefs 已成功完成权威投影（包括明确的空集合）时才记录。
 */
export function projectAgentV3ResultSet({ capability, result } = {}) {
  if (!capability || result?.status !== 'success') return null;
  const refs = rawResultRefs(result);
  if (!refs.length && result?.referenceProjectionComplete !== true) return null;
  return Object.freeze({
    capabilityId: capability.id,
    domains: capability.domains,
    refs: Object.freeze(refs),
    status: refs.length ? 'success' : 'empty',
  });
}

/**
 * 根据真实读取和 ResultSet 投影结果决定会话焦点的终态。
 *
 * “读取成功”与“产生可跨轮资源引用”是两个维度：统计、概览等工具可能成功回答，
 * 却没有稳定资源 ID。此时应提交语义焦点并清空旧资源范围，而不是误标为 degraded。
 */
export function resolveAgentV3ReadFocusSettlement({ readAttempted = false, committed = false, failed = false } = {}) {
  if (committed) return failed ? 'degraded' : null;
  if (failed) return 'failed';
  return readAttempted ? 'success' : 'degraded';
}

export const __testing = Object.freeze({ rawResultRefs });
