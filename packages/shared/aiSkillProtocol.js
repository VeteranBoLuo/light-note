export const AI_SKILL_PROTOCOL_VERSION = 1;

export const AI_SKILL_STATUSES = Object.freeze([
  "completed",
  "preview_ready",
  "needs_confirmation",
  "failed",
  "cancelled",
]);

export const AI_SKILL_RESULT_KINDS = Object.freeze([
  "grounded_markdown",
  "text",
  "structured_draft",
  "field_suggestions",
  "artifact_preview",
]);

export const AI_SKILL_RESOURCE_TYPES = Object.freeze([
  "note",
  "bookmark",
  "file",
  "todo",
  "tag",
  "help",
]);

const REQUEST_KEYS = new Set([
  "protocolVersion",
  "requestId",
  "skillId",
  "skillVersion",
  "threadId",
  "input",
  "scope",
  "client",
]);
const SCOPE_KEYS = new Set(["resourceRefs"]);
const RESOURCE_REF_KEYS = new Set(["type", "id", "version"]);
const CLIENT_KEYS = new Set(["locale", "timezone", "surface"]);
const RESPONSE_KEYS = new Set([
  "protocolVersion",
  "requestId",
  "skillId",
  "skillVersion",
  "status",
  "threadId",
  "scopeDigest",
  "result",
  "sources",
  "coverage",
  "availableActions",
  "receipt",
  "error",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SKILL_ID_PATTERN = /^[a-z][a-z0-9_]{1,31}\.[a-z][a-z0-9_]{1,63}$/u;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._:@/-]{1,128}$/u;
const IANA_TIMEZONE_PATTERN = /^[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)+$/u;
const RESOURCE_TYPE_SET = new Set(AI_SKILL_RESOURCE_TYPES);
const STATUS_SET = new Set(AI_SKILL_STATUSES);
const RESULT_KIND_SET = new Set(AI_SKILL_RESULT_KINDS);

export class AiSkillProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AiSkillProtocolError";
    this.code = code;
    this.status = 400;
  }
}

function protocolError(code, message) {
  throw new AiSkillProtocolError(code, message);
}

function assertPlainObject(value, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    protocolError(code, `${label} 必须是对象`);
  return value;
}

function assertKnownKeys(value, allowed, code, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length)
    protocolError(code, `${label} 包含未知字段：${unknown.join(", ")}`);
}

function normalizeString(
  value,
  { required = false, maxLength = 128, code, label, pattern } = {},
) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) protocolError(code, `${label}不能为空`);
  if (
    normalized.length > maxLength ||
    (normalized && pattern && !pattern.test(normalized))
  ) {
    protocolError(code, `${label}格式无效`);
  }
  return normalized;
}

function normalizeVersion(value, label = "skillVersion") {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1 || version > 10_000) {
    protocolError("AI_SKILL_VERSION_INVALID", `${label}格式无效`);
  }
  return version;
}

function normalizeResourceRefs(scope) {
  const value = assertPlainObject(
    scope ?? {},
    "AI_SKILL_SCOPE_INVALID",
    "scope",
  );
  assertKnownKeys(value, SCOPE_KEYS, "AI_SKILL_SCOPE_UNKNOWN_FIELD", "scope");
  const refs = value.resourceRefs ?? [];
  if (!Array.isArray(refs) || refs.length > 20) {
    protocolError(
      "AI_SKILL_SCOPE_INVALID",
      "resourceRefs 必须是最多 20 项的数组",
    );
  }
  const seen = new Set();
  return refs.map((item, index) => {
    const ref = assertPlainObject(
      item,
      "AI_SKILL_RESOURCE_REF_INVALID",
      `resourceRefs[${index}]`,
    );
    assertKnownKeys(
      ref,
      RESOURCE_REF_KEYS,
      "AI_SKILL_RESOURCE_REF_UNKNOWN_FIELD",
      `resourceRefs[${index}]`,
    );
    const type = normalizeString(ref.type, {
      required: true,
      maxLength: 32,
      code: "AI_SKILL_RESOURCE_TYPE_INVALID",
      label: `resourceRefs[${index}].type`,
    });
    if (!RESOURCE_TYPE_SET.has(type))
      protocolError("AI_SKILL_RESOURCE_TYPE_INVALID", `不支持资源类型 ${type}`);
    const id = normalizeString(ref.id, {
      required: true,
      maxLength: 128,
      pattern: SAFE_ID_PATTERN,
      code: "AI_SKILL_RESOURCE_ID_INVALID",
      label: `resourceRefs[${index}].id`,
    });
    const key = `${type}:${id}`;
    if (seen.has(key))
      protocolError("AI_SKILL_RESOURCE_DUPLICATED", `资源 ${key} 重复`);
    seen.add(key);
    const version =
      ref.version == null
        ? null
        : normalizeString(ref.version, {
            maxLength: 128,
            pattern: SAFE_ID_PATTERN,
            code: "AI_SKILL_RESOURCE_VERSION_INVALID",
            label: `resourceRefs[${index}].version`,
          });
    return Object.freeze({ type, id, ...(version ? { version } : {}) });
  });
}

function normalizeClient(client) {
  const value = assertPlainObject(
    client ?? {},
    "AI_SKILL_CLIENT_INVALID",
    "client",
  );
  assertKnownKeys(
    value,
    CLIENT_KEYS,
    "AI_SKILL_CLIENT_UNKNOWN_FIELD",
    "client",
  );
  const locale = normalizeString(value.locale || "zh-CN", {
    maxLength: 20,
    pattern: /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u,
    code: "AI_SKILL_LOCALE_INVALID",
    label: "client.locale",
  });
  const timezone = normalizeString(value.timezone || "Asia/Singapore", {
    maxLength: 64,
    pattern: IANA_TIMEZONE_PATTERN,
    code: "AI_SKILL_TIMEZONE_INVALID",
    label: "client.timezone",
  });
  const surface = normalizeString(value.surface || "unknown", {
    maxLength: 64,
    pattern: /^[a-z][a-z0-9_.-]{0,63}$/u,
    code: "AI_SKILL_SURFACE_INVALID",
    label: "client.surface",
  });
  return Object.freeze({ locale, timezone, surface });
}

export function validateAiSkillRequest(input) {
  const value = assertPlainObject(
    input,
    "AI_SKILL_REQUEST_INVALID",
    "AI Skill 请求",
  );
  assertKnownKeys(
    value,
    REQUEST_KEYS,
    "AI_SKILL_REQUEST_UNKNOWN_FIELD",
    "AI Skill 请求",
  );
  if (Number(value.protocolVersion) !== AI_SKILL_PROTOCOL_VERSION) {
    protocolError("AI_SKILL_PROTOCOL_INCOMPATIBLE", "AI Skill 协议版本不兼容");
  }
  const requestId = normalizeString(value.requestId, {
    required: true,
    maxLength: 36,
    pattern: UUID_PATTERN,
    code: "AI_SKILL_REQUEST_ID_INVALID",
    label: "requestId",
  });
  const skillId = normalizeString(value.skillId, {
    required: true,
    maxLength: 96,
    pattern: SKILL_ID_PATTERN,
    code: "AI_SKILL_ID_INVALID",
    label: "skillId",
  });
  const skillVersion = normalizeVersion(value.skillVersion);
  const threadId =
    value.threadId == null
      ? null
      : normalizeString(value.threadId, {
          required: true,
          maxLength: 128,
          pattern: SAFE_ID_PATTERN,
          code: "AI_SKILL_THREAD_ID_INVALID",
          label: "threadId",
        });
  const normalizedInput = assertPlainObject(
    value.input ?? {},
    "AI_SKILL_INPUT_INVALID",
    "input",
  );
  return Object.freeze({
    protocolVersion: AI_SKILL_PROTOCOL_VERSION,
    requestId,
    skillId,
    skillVersion,
    threadId,
    input: Object.freeze({ ...normalizedInput }),
    scope: Object.freeze({
      resourceRefs: Object.freeze(normalizeResourceRefs(value.scope)),
    }),
    client: normalizeClient(value.client),
  });
}

export function validateAiSkillResponse(input) {
  const value = assertPlainObject(
    input,
    "AI_SKILL_RESPONSE_INVALID",
    "AI Skill 响应",
  );
  assertKnownKeys(
    value,
    RESPONSE_KEYS,
    "AI_SKILL_RESPONSE_UNKNOWN_FIELD",
    "AI Skill 响应",
  );
  if (Number(value.protocolVersion) !== AI_SKILL_PROTOCOL_VERSION) {
    protocolError("AI_SKILL_PROTOCOL_INCOMPATIBLE", "AI Skill 协议版本不兼容");
  }
  const requestId = normalizeString(value.requestId, {
    required: true,
    maxLength: 36,
    pattern: UUID_PATTERN,
    code: "AI_SKILL_REQUEST_ID_INVALID",
    label: "requestId",
  });
  const skillId = normalizeString(value.skillId, {
    required: true,
    maxLength: 96,
    pattern: SKILL_ID_PATTERN,
    code: "AI_SKILL_ID_INVALID",
    label: "skillId",
  });
  const skillVersion = normalizeVersion(value.skillVersion);
  const status = normalizeString(value.status, {
    required: true,
    maxLength: 32,
    code: "AI_SKILL_STATUS_INVALID",
    label: "status",
  });
  if (!STATUS_SET.has(status))
    protocolError("AI_SKILL_STATUS_INVALID", `不支持响应状态 ${status}`);
  const scopeDigest =
    value.scopeDigest == null
      ? null
      : normalizeString(value.scopeDigest, {
          maxLength: 64,
          pattern: /^[a-f0-9]{64}$/u,
          code: "AI_SKILL_SCOPE_DIGEST_INVALID",
          label: "scopeDigest",
        });
  const result =
    value.result == null
      ? null
      : assertPlainObject(value.result, "AI_SKILL_RESULT_INVALID", "result");
  if (result && !RESULT_KIND_SET.has(String(result.kind || ""))) {
    protocolError("AI_SKILL_RESULT_KIND_INVALID", "result.kind 不受支持");
  }
  if (
    ["completed", "preview_ready", "needs_confirmation"].includes(status) &&
    !result
  ) {
    protocolError("AI_SKILL_RESULT_REQUIRED", "成功终态必须包含 result");
  }
  if (status === "failed" && !value.error)
    protocolError("AI_SKILL_ERROR_REQUIRED", "失败终态必须包含 error");
  if (
    !Array.isArray(value.sources ?? []) ||
    !Array.isArray(value.availableActions ?? [])
  ) {
    protocolError(
      "AI_SKILL_RESPONSE_COLLECTION_INVALID",
      "sources 与 availableActions 必须是数组",
    );
  }
  return Object.freeze({
    ...value,
    requestId,
    skillId,
    skillVersion,
    status,
    scopeDigest,
    result,
  });
}
