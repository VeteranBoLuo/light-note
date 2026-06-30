// 轻笺前后端共享契约 —— 单一来源,改这里前后端同步生效。
// 这些是 resultData 的「业务 status」(HTTP 始终 200,除少数显式 res.status)。
export const STATUS = Object.freeze({
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BANNED: 423,
  SERVER_ERROR: 500,
  // 游客只读预览:写操作返回此状态,前端弹注册软引导。
  // 红线:不可用 401/403/'visitor' 代替(前端会当成会话过期/硬错误)。
  PREVIEW: 'preview',
  // 会话失效 / 游客身份信号。
  VISITOR: 'visitor',
});
