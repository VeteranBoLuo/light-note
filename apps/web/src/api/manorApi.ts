import type { ManorCommand, ManorSnapshot } from '@lightnote/shared/manor';
import { MANOR_VERSION } from '@lightnote/shared/manor';
import { apiBaseGet, apiBasePost } from '@/http/request';

function checkedSnapshot(response: {status: number; data?: ManorSnapshot & {code?: string}}, command = false): ManorSnapshot {
  if(response.status!==200||!response.data)throw {code:response.data?.code,status:response.status};
  // A successful command may already have committed under the newer runtime.
  // Keep its original receipt until the refreshed page can confirm that result.
  if(response.data.version!==MANOR_VERSION)throw {code:'MANOR_VERSION_UNSUPPORTED',status:409,...(command?{receiptUnconfirmed:true}:{})};
  return response.data;
}
export async function getManor(signal?: AbortSignal, background = false): Promise<ManorSnapshot> {
  const response = await apiBaseGet('/api/growth/manor', undefined, { silent: true, signal, activity: background ? 'background' : 'foreground' });
  return checkedSnapshot(response);
}

export async function runManorCommand(command: ManorCommand): Promise<ManorSnapshot> {
  const response = await apiBasePost('/api/growth/manor/commands', command, { silent: true });
  return checkedSnapshot(response,true);
}
