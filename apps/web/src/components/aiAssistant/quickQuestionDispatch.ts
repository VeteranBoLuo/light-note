export interface QuickQuestionDispatchOptions {
  isBusy: () => boolean;
  setInput: (value: string) => void;
  afterInputChange: () => Promise<unknown>;
  send: () => Promise<unknown> | unknown;
}

/**
 * 推荐问题是“一键提问”，与附件区可继续编辑的提示词建议语义不同。
 * 内部 pending 锁覆盖 setInput 到 send 真正开始前的微任务间隙，避免快速双击重复发送。
 */
export function createQuickQuestionDispatcher(options: QuickQuestionDispatchOptions) {
  let pending = false;

  return async (rawQuestion: string): Promise<boolean> => {
    const question = String(rawQuestion || '').trim();
    if (!question || pending || options.isBusy()) return false;

    pending = true;
    try {
      options.setInput(question);
      await options.afterInputChange();
      if (options.isBusy()) return false;
      await options.send();
      return true;
    } finally {
      pending = false;
    }
  };
}
