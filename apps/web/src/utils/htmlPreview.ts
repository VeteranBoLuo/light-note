/**
 * 上传的 HTML 属于不可信内容。只允许文件自身脚本与 3D 场景常用的指针锁定，
 * 不开放同源身份、表单、弹窗、下载或顶层导航，避免预览内容接触轻笺登录态。
 */
export const HTML_PREVIEW_SANDBOX = 'allow-scripts allow-pointer-lock';

export const HTML_PREVIEW_REFERRER_POLICY = 'no-referrer' as const;
