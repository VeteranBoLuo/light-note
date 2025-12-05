import { apiBasePost } from '@/http/request.ts';

export async function getJsonInfo(name: string) {
  return await apiBasePost('/api/json/getConfigByName', { name: name });
}

// 更新
export function updateConfig(data: any) {
  return apiBasePost('/api/json/updateConfig', data);
}

export function deleteConfigById(id: string) {
  return apiBasePost('/api/json/deleteConfigById', { id });
}
