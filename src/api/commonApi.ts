import { apiBasePost } from '@/http/request.ts';

export const recordOperation = async function (params: { module: string; operation: string }) {
  if (!params?.module || !params?.operation) {
    return;
  }
  try {
    await apiBasePost('/api/common/recordOperationLogs', params);
  } catch (error) {
    console.warn('record operation failed:', error);
  }
};
