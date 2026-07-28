import { reactive } from 'vue';

export type MessageType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface MessageItem {
  id: number;
  type: MessageType;
  content: string;
  duration: number;
  key?: string;
  onClose?: () => void;
}

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
  const index = messageState.messages.findIndex((message) => message.id === id);
  if (index === -1) return;
  const [message] = messageState.messages.splice(index, 1);
  message.onClose?.();
}

export function clearMessages(): void {
  const messages = [...messageState.messages];
  messageState.messages.splice(0);
  messages.forEach((message) => message.onClose?.());
}
