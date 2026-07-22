// 长期 AI 记忆尚未开放。该开关必须由所有写入口共享，不能只依赖聊天处理器的请求级判断。
export const AI_MEMORY_ENABLED = false;

export function assertAiMemoryWritesEnabled() {
  if (AI_MEMORY_ENABLED) return;
  const error = new Error('AI_MEMORY_DISABLED: 长期 AI 记忆当前已关闭');
  error.code = 'AI_MEMORY_DISABLED';
  error.status = 409;
  throw error;
}
