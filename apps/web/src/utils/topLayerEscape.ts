type BackgroundEscapeEvent = Pick<KeyboardEvent, 'defaultPrevented' | 'isComposing' | 'keyCode' | 'repeat'>;

const activeTopLayerLocks = new Set<symbol>();

/**
 * 顶层预览显示期间锁住背景层的 Escape 行为。
 * 返回值可重复调用，便于 watch 与 unmount 共用同一条清理路径。
 */
export function acquireTopLayerEscapeLock(): () => void {
  const token = Symbol('top-layer-escape-lock');
  let released = false;
  activeTopLayerLocks.add(token);

  return () => {
    if (released) return;
    released = true;
    activeTopLayerLocks.delete(token);
  };
}

export function hasTopLayerEscapeLock(): boolean {
  return activeTopLayerLocks.size > 0;
}

/**
 * 持久背景层（例如 AI 抽屉）只处理一次明确的新 Escape 按键。
 * 顶层浮层、输入法组合态、已消费事件与长按重复事件都应优先忽略。
 */
export function shouldIgnoreBackgroundEscape(event: BackgroundEscapeEvent): boolean {
  return (
    event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat || hasTopLayerEscapeLock()
  );
}
