const SECRET_ASSIGNMENT =
  /\b([a-z0-9_-]*(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|session)[a-z0-9_-]*)\s*[:=]\s*([^\s,;]+)/giu;
const BEARER_TOKEN = /\bBearer\s+[a-z0-9._~+\/-]+=*/giu;
const SENSITIVE_QUERY =
  /([?&](?:token|key|secret|signature|auth|session)=)[^&#\s]+/giu;
const URI_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/giu;
const JWT_TOKEN = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/giu;
const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;

export function redactOperationalText(value, maxLength = 24_000) {
  return String(value || "")
    .replace(CONTROL_CHARACTERS, "")
    .replace(SECRET_ASSIGNMENT, "$1=[REDACTED]")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(SENSITIVE_QUERY, "$1[REDACTED]")
    .replace(URI_CREDENTIALS, "$1[REDACTED]@")
    .replace(JWT_TOKEN, "[REDACTED_JWT]")
    .replace(PRIVATE_KEY_BLOCK, "[REDACTED_PRIVATE_KEY]")
    .slice(0, maxLength);
}

export function stableErrorCode(error) {
  return String(error?.code || error?.name || "HOST_AGENT_UNKNOWN_ERROR")
    .replace(/[^A-Z0-9_:-]/giu, "_")
    .slice(0, 80);
}
