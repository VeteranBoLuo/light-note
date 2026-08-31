export class ToolboxError extends Error {
  constructor(code, message, status = 400, data = {}) {
    super(message);
    this.name = 'ToolboxError';
    this.code = code;
    this.status = status;
    this.data = { code, ...data };
  }
}

export function toolboxError(code, message, status = 400, data = {}) {
  return new ToolboxError(code, message, status, data);
}

export function parseToolboxError(error) {
  if (error instanceof ToolboxError) return error;
  const code = String(error?.code || 'TOOLBOX_INTERNAL_ERROR').slice(0, 64);
  const status = Number(error?.status || 500);
  const safeMessage = status >= 500 ? '工具任务暂时无法处理，请稍后重试' : String(error?.message || '工具任务处理失败');
  return new ToolboxError(code, safeMessage, status >= 400 && status <= 599 ? status : 500);
}
