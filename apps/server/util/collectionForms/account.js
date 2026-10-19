import { getSession } from '../sessionStore.js';
import { FormError } from '@lightnote/shared/collection-forms';

// Only called for member forms. Ordinary anonymous forms never inspect account cookies.
// Session roles are historical snapshots; the service rechecks the live account and restrictions.
export async function readCollectionAccount(req) {
  if (req.headers['x-admin-context'] || req.adminContext || req.isAdminPreview)
    throw new FormError('请使用自己的正式账号参与收集', 403);
  // auth.js also loads the application's route graph. Resolve it after startup,
  // only for member forms, rather than introducing a public-router import cycle.
  const { getRequestSidCandidates } = await import('../auth.js');
  for (const sid of getRequestSidCandidates(req)) {
    const session = await getSession(sid);
    if (session?.user_id) return { id: session.user_id };
  }
  return null;
}
