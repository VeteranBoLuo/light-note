// 用户内容的服务端权威容量预算。
// 安全检测、业务 handler 与派生存储必须复用这里的值，避免通用阈值把合法大载荷记成攻击。
export const NOTE_CONTENT_MAX_LENGTH = 1_000_000;
export const NOTE_EXPORT_MAX_BYTES = 6 * 1024 * 1024;
export const DRAWING_THUMBNAIL_MAX_BYTES = 256 * 1024;
export const TAG_ICON_MAX_SVG_BYTES = 32 * 1024;
