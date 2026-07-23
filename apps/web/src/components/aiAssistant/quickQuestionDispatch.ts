export interface QuickQuestionDispatchOptions {
  isBusy: () => boolean;
  send: (question: string) => Promise<unknown> | unknown;
}

/**
 * 推荐问题是“一键提问”，直接把文本交给发送流程，不经过输入框中转。
 * 内部 pending 锁覆盖发送函数真正进入 busy 状态前的异步间隙，避免快速双击重复发送。
 */
export function createQuickQuestionDispatcher(options: QuickQuestionDispatchOptions) {
  let pending = false;

  return async (rawQuestion: string): Promise<boolean> => {
    const question = String(rawQuestion || '').trim();
    if (!question || pending || options.isBusy()) return false;

    pending = true;
    try {
      await options.send(question);
      return true;
    } finally {
      pending = false;
    }
  };
}
