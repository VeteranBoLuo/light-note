import type { ManorCommand, ManorSnapshot } from '@lightnote/shared/manor';
import { apiBaseGet, apiBasePost } from '@/http/request';

export async function getManor(): Promise<ManorSnapshot> {
  const response = await apiBaseGet('/api/growth/manor', undefined, { silent: true });
  if (response.status !== 200 || !response.data) throw { code: response.data?.code, status: response.status };
  return response.data as ManorSnapshot;
}

export async function runManorCommand(command: ManorCommand): Promise<ManorSnapshot> {
  const response = await apiBasePost('/api/growth/manor/commands', command, { silent: true });
  if (response.status !== 200 || !response.data) throw { code: response.data?.code, status: response.status };
  return response.data as ManorSnapshot;
}
