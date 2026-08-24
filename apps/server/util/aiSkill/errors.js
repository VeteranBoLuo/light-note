export class AiSkillError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'AiSkillError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function aiSkillError(code, message, status = 400, details = null) {
  return new AiSkillError(code, message, status, details);
}
