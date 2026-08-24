/**
 * AI 产品能力共用的操作者/数据主体上下文。
 * 身份只从服务端鉴权与管理员代管中间件读取，禁止由模型输入或客户端资源引用决定。
 */
export function resolveAiIdentity(req) {
  const actor = req?.billingUser || req?.user || {};
  const subject = req?.resourceUser || req?.user || {};
  const actorUserId = String(actor.id || 'visitor').trim() || 'visitor';
  const actorRole = String(actor.role || 'visitor').trim() || 'visitor';
  return Object.freeze({
    actorUserId,
    actorRole,
    subjectUserId: String(subject.id || actorUserId).trim() || actorUserId,
    subjectRole: String(subject.role || actorRole).trim() || actorRole,
    adminContextId: req?.adminContext?.id || null,
    adminContextMode: req?.adminContext?.mode || 'normal',
  });
}
