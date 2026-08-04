import { reactive } from 'vue';

export type MessageType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface MessageItem {
  id: number;
  type: MessageType;
  content: string;
  duration: number;
  key?: string;
  onClose?: () => void;
  /** 正在播放离场动画。此时节点仍在 DOM 里,只是不再参与去重、也不响应点击。 */
  leaving?: boolean;
}

/**
 * 离场动画时长,必须与 BMessageContainer 里 `.b-message-item.is-leaving` 的 animation 时长一致。
 *
 * 离场做成两阶段(先标记 leaving 让 CSS 播动画,到时再真正 splice)而不是交给 Vue 的
 * <TransitionGroup>:后者在本组件「手动 render() 挂载 + 自引用 Teleport」的结构下摘不掉离场节点,
 * 消息从 state 移除后 DOM 仍留在屏幕上(详见 BMessageContainer 的注释)。
 */
export const LEAVE_ANIMATION_MS = 200;

export interface MessageOpenConfig {
  content: string;
  type?: MessageType;
  duration?: number;
  key?: string;
  onClose?: () => void;
}

export const messageState = reactive({
  messages: [] as MessageItem[],
});

export function removeMessage(id: number): void {
  const message = messageState.messages.find((item) => item.id === id);
  // 已在离场中:不重复计时,也不重复触发 onClose
  if (!message || message.leaving) return;
  message.leaving = true;
  window.setTimeout(() => {
    const index = messageState.messages.findIndex((item) => item.id === id);
    // clearMessages() 可能已经把它清掉了
    if (index === -1) return;
    const [removed] = messageState.messages.splice(index, 1);
    removed.onClose?.();
  }, LEAVE_ANIMATION_MS);
}

export function clearMessages(): void {
  const messages = [...messageState.messages];
  messageState.messages.splice(0);
  messages.forEach((message) => message.onClose?.());
}
