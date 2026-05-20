import { apiBaseGet, apiBasePost } from '@/http/request.ts';
import { isAdminLoginPreview } from '@/utils/authStorage.ts';

export const recordOperation = async function (params: { module: string; operation: string }) {
  if (isAdminLoginPreview()) {
    return;
  }
  if (!params?.module || !params?.operation) {
    return;
  }
  try {
    await apiBasePost('/api/common/recordOperationLogs', params);
  } catch (error) {
    console.warn('record operation failed:', error);
  }
};

export const getNoticeSummary = async function () {
  return apiBaseGet('/api/common/noticeSummary');
};
