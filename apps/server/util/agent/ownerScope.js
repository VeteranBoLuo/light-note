/**
 * 个人资源类工具共用的「归属作用域」话术。
 *
 * 这些工具的 user 参数含义与管理日志类工具（query_api_logs / query_operation_logs /
 * get_token_usage）正好相反：那边不传表示查所有用户，这边不传表示只查自己。
 * 同名参数两种语义，模型很容易按日志工具的直觉理解，把「今天平台新增的笔记」
 * 规划成一次不带 user 的调用，结果只查到管理员自己的空结果。
 *
 * 因此作用域必须在描述里写死成语义约束，而不是靠调用方猜；话术集中在这里，
 * 避免五个工具各写一份后逐渐漂移。
 */

/** 个人资源工具 user 参数的统一说明。 */
export const PERSONAL_SCOPE_USER_PARAM =
  '可选，仅管理员可用：指定要查哪一位用户的数据。优先传邮箱或用户 ID——昵称可能被多个账号共用，重名时本次查询会直接失败并要求改用邮箱。不传时只查当前登录用户自己的数据。';

/**
 * 拼出工具 description 里的作用域声明。
 * @param {string} label 资源名称，例如「笔记」「书签」「云空间文件」
 */
export function personalScopeHint(label) {
  return (
    `本工具一次只返回一位用户的${label}：不传 user 就是当前登录用户自己的${label}，不会跨用户检索；` +
    `管理员要看指定用户的${label}必须传 user；` +
    `要一次性列出全平台各用户新增的${label}（例如“今天平台新增的${label}有哪些”“这些${label}的标题分别是什么”），` +
    `改用 query_platform_resources，不要用本工具逐个用户去凑；` +
    `若问题同时限定“新注册用户”和“这些用户新增的资源”，改用 query_new_user_resources 一次完成。`
  );
}
