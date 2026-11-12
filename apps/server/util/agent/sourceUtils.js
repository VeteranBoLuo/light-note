export function resolveKnowledgeSourceTarget(source, userRole) {
  if (source?.status === 'public' && source?.category === '帮助中心') return 'help-article';
  if (source?.status === 'internal' && userRole === 'root') return 'knowledge-admin';
  return undefined;
}
