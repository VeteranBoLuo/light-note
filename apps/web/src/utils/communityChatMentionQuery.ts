export interface CommunityChatMentionQuery {
  start: number;
  end: number;
  keyword: string;
}

const MAX_MENTION_QUERY_LENGTH = 32;
const QUERY_TERMINATOR = /[\s@.,;:!?，。！？；：、/\\()[\]{}<>"'“”‘’]/u;
const URL_PREFIX = /(?:[a-z][a-z\d+.-]*:\/\/|www\.)\S*$/iu;

/**
 * 解析聊天室光标处正在输入的 `@关键词`。
 *
 * 聊天场景允许在任意正文后直接提及成员，例如 `123@`、`你好@薄荷`；
 * 查询遇到空白、标点、第二个 @ 或明显 URL 结构时结束，避免候选层持续干扰普通文本输入。
 */
export function resolveCommunityChatMentionQuery(text: string, caret: number): CommunityChatMentionQuery | null {
  const value = String(text ?? '');
  const cursor = Math.max(0, Math.min(Number(caret) || 0, value.length));
  const prefix = value.slice(0, cursor);
  const atIndex = prefix.lastIndexOf('@');
  if (atIndex < 0) return null;

  const keyword = prefix.slice(atIndex + 1);
  if (Array.from(keyword).length > MAX_MENTION_QUERY_LENGTH || QUERY_TERMINATOR.test(keyword)) return null;

  const textBeforeAt = prefix.slice(0, atIndex);
  const previousAtIndex = textBeforeAt.lastIndexOf('@');
  if (previousAtIndex >= 0 && !QUERY_TERMINATOR.test(textBeforeAt.slice(previousAtIndex + 1))) return null;
  if (URL_PREFIX.test(textBeforeAt)) return null;

  return { start: atIndex, end: cursor, keyword };
}
