interface CalendarIdentity {
  id?: string;
  role?: string;
  visitorWorkspace?: boolean;
  adminContext?: { subjectUserId?: string; mode?: string } | null;
}
export const todoCalendarOwnerKey = (user: CalendarIdentity) =>
  [user.id, user.role, user.visitorWorkspace, user.adminContext?.subjectUserId, user.adminContext?.mode].join('|');
export const canEnsureTodoCalendarRange = (user: CalendarIdentity) =>
  Boolean(user.id && user.role && user.role !== 'visitor' && !user.visitorWorkspace && !user.adminContext);
export const isCalendarPermissionError = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code || '';
  return code.startsWith('ADMIN_') || code === 'VISITOR_WRITE_FORBIDDEN';
};
