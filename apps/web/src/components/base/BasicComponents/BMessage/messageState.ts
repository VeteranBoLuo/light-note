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
