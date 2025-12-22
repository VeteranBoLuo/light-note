import { apiBasePost } from '@/http/request.ts';

export const recordOperation = async function (params: { module: string; operation: string }) {
  await apiBasePost('/api/common/recordOperationLogs', params);
};
