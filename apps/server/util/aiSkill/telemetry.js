const LENGTH_BUCKETS = Object.freeze([
  [0, '0'],
  [50, '1_50'],
  [200, '51_200'],
  [500, '201_500'],
  [Number.POSITIVE_INFINITY, '501_plus'],
]);

export function aiSkillLengthBucket(value) {
  const length = Math.max(0, Number(value) || 0);
  return LENGTH_BUCKETS.find(([maximum]) => length <= maximum)?.[1] || '501_plus';
}

export function aiSkillDurationBucket(durationMs) {
  const duration = Math.max(0, Number(durationMs) || 0);
  if (duration < 1_000) return 'under_1s';
  if (duration < 3_000) return '1_3s';
  if (duration < 10_000) return '3_10s';
  if (duration < 30_000) return '10_30s';
  if (duration < 120_000) return '30_120s';
  return '120s_plus';
}

export function aiSkillResourceCountBucket(count) {
  const value = Math.max(0, Number(count) || 0);
  if (value === 0) return '0';
  if (value === 1) return '1';
  if (value <= 5) return '2_5';
  if (value <= 10) return '6_10';
  if (value <= 20) return '11_20';
  return '21_plus';
}

function serializedLength(value) {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return 0;
  }
}

function resourceType(skill, refs) {
  const types = [...new Set((refs || []).map((ref) => String(ref.type || '')).filter(Boolean))];
  if (types.length > 1) return 'mixed';
  if (types.length === 1) return types[0];
  return ['help', 'search'].includes(skill.domain) ? skill.domain : 'none';
}

export function buildAiSkillTelemetryDimensions({ skill, request, response, error, durationMs } = {}) {
  const refs = request?.scope?.resourceRefs || [];
  return {
    skillId: skill.id,
    surface: request.client.surface,
    resourceType: resourceType(skill, refs),
    resourceCountBucket: aiSkillResourceCountBucket(refs.length),
    inputLengthBucket: aiSkillLengthBucket(serializedLength(request.input)),
    ...(response ? { outputLengthBucket: aiSkillLengthBucket(serializedLength(response.result)) } : {}),
    ...(durationMs == null ? {} : { durationBucket: aiSkillDurationBucket(durationMs) }),
    ...(error?.code ? { errorCode: String(error.code) } : {}),
  };
}

export function recordAiSkillTelemetry({ recorder, identity, event, dimensions }) {
  if (typeof recorder !== 'function') return Promise.resolve({ accepted: false, skipped: true });
  return Promise.resolve(recorder(identity, { event, dimensions })).catch((error) => {
    console.error('[ai-skill] telemetry failed code=%s', String(error?.code || 'AI_SKILL_TELEMETRY_FAILED'));
    return { accepted: false, skipped: true };
  });
}

export const aiSkillTelemetryInternals = Object.freeze({ serializedLength, resourceType, LENGTH_BUCKETS });
