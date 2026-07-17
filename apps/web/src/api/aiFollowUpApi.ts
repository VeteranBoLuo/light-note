import { apiBasePost } from '@/http/request';

export interface AiFollowUpResult {
  requestId: string;
  suggestions: string[];
  strategy: 'ai' | 'fallback';
}

export async function fetchAiFollowUps(requestId: string): Promise<AiFollowUpResult> {
  const response = await apiBasePost('/api/chat/agent/follow-ups', { requestId }, { silent: true, timeout: 4500 });
  if (response?.status !== 200) {
    throw new Error(response?.msg || '暂时无法生成相关问题');
  }
  const suggestions = (Array.isArray(response.data?.suggestions) ? response.data.suggestions : [])
    .map((item: unknown) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    requestId: String(response.data?.requestId || requestId),
    suggestions,
    strategy: response.data?.strategy === 'ai' ? 'ai' : 'fallback',
  };
}
