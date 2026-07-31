/**
 * 跨模块通用的 `@` 提及触发与查询解析。
 *
 * 触发规则本身沿用笔记编辑器已经打磨过的实现(排除邮箱、URL、Markdown 代码与链接语法),
 * 这里只补上「从纯文本 + 光标位置解析出当前 @ 查询区间」的能力,供待办说明、AI 输入框等
 * 普通 textarea 场景复用——它们不像笔记那样有 DOM 上下文可判断。
 */
import { isResourceMentionTextTrigger } from './noteMentionTrigger';

export { isResourceMentionTextTrigger };

export interface MentionQuery {
  /** `@` 自身的下标 */
  start: number;
  /** 查询串结束下标(不含),通常等于光标位置 */
  end: number;
  /** `@` 与光标之间的关键词,不含 `@` */
  keyword: string;
}

/** 关键词里出现这些字符说明用户已经在写别的内容,提及应当关闭。 */
const KEYWORD_TERMINATOR = /[\s\n\r@]/;
const MAX_KEYWORD_LENGTH = 50;

/**
 * 解析光标处正在输入的 `@关键词`。
 * @returns 命中时返回区间与关键词;不在提及上下文时返回 null。
 */
export function resolveMentionQuery(text: string, caret: number): MentionQuery | null {
  const value = String(text ?? '');
  const cursor = Math.max(0, Math.min(Number(caret) || 0, value.length));

  // 从光标往前找最近的 @,中途遇到空白/换行即判定不在提及上下文
  let atIndex = -1;
  for (let index = cursor - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === '@') {
      atIndex = index;
      break;
    }
    if (KEYWORD_TERMINATOR.test(char)) return null;
    if (cursor - index > MAX_KEYWORD_LENGTH) return null;
  }
  if (atIndex < 0) return null;
  if (!isResourceMentionTextTrigger(value, atIndex)) return null;

  return { start: atIndex, end: cursor, keyword: value.slice(atIndex + 1, cursor) };
}

/** 用给定内容替换 `@关键词` 区间;传空串即为「只消费掉查询文本」。 */
export function replaceMentionQuery(text: string, query: MentionQuery, replacement = ''): string {
  const value = String(text ?? '');
  return value.slice(0, query.start) + replacement + value.slice(query.end);
}
