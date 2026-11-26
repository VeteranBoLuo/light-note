export interface ResourceReadIdentity {
  id?: string;
  role?: string;
  visitorWorkspace?: boolean;
  adminContext?: {
    id?: string;
    subjectUserId?: string;
    mode?: string;
  } | null;
}

export function buildResourceReadScope(identity: ResourceReadIdentity) {
  return [
    identity.id || 'anonymous',
    identity.role || '',
    identity.visitorWorkspace ? 'visitor-workspace' : '',
    identity.adminContext?.id || '',
    identity.adminContext?.subjectUserId || '',
    identity.adminContext?.mode || '',
  ].join('|');
}
