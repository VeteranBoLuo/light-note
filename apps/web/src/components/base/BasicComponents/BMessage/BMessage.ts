import { createVNode, render } from 'vue';
import BMessageContainer from './BMessageContainer.vue';
import { clearMessages, messageState, removeMessage } from './messageState';
import type { MessageType, MessageOpenConfig } from './messageState';

let seed = 0;
let mounted = false;

function ensureMounted() {
  if (mounted) return;
  mounted = true;
  const container = document.createElement('div');
  container.setAttribute('class', 'b-message-root');
  document.body.appendChild(container);
  const vnode = createVNode(BMessageContainer);
  render(vnode, container);
}

const mobileDuration: Record<MessageType, number> = {
  success: 1.8,
  info: 2.5,
  warning: 4,
  error: 4,
  loading: 3,
};

function isMobileMessageViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches === true;
}

function resolveDuration(type: MessageType, duration?: number): number {
  if (typeof duration === 'number') return duration;
  return isMobileMessageViewport() ? mobileDuration[type] : 3;
}

function suppressDuplicateMobileMessage(type: MessageType, content: string): (() => void) | null {
  if (!isMobileMessageViewport()) return null;
  const existing = messageState.messages.find((message) => message.type === type && message.content === content);
  return existing ? () => removeMessage(existing.id) : null;
}

function add(type: MessageType, content: string, duration?: number, onClose?: () => void): () => void {
  ensureMounted();
  const duplicateCloser = suppressDuplicateMobileMessage(type, content);
  if (duplicateCloser) return duplicateCloser;
  const id = ++seed;
  const item = {
    id,
    type,
    content,
    duration: resolveDuration(type, duration),
    onClose,
  };
  messageState.messages.push(item);
  if (item.duration > 0) {
    setTimeout(() => removeMessage(id), item.duration * 1000);
  }
  return () => removeMessage(id);
}

const message = {
  success(content: string, duration?: number, onClose?: () => void): () => void {
    return add('success', content, duration, onClose);
  },

  error(content: string, duration?: number, onClose?: () => void): () => void {
    return add('error', content, duration, onClose);
  },

  warning(content: string, duration?: number, onClose?: () => void): () => void {
    return add('warning', content, duration, onClose);
  },

  warn(content: string, duration?: number, onClose?: () => void): () => void {
    return add('warning', content, duration, onClose);
  },

  info(content: string, duration?: number, onClose?: () => void): () => void {
    return add('info', content, duration, onClose);
  },

  loading(content: string, duration?: number, onClose?: () => void): () => void {
    return add('loading', content, duration, onClose);
  },

  open(config: MessageOpenConfig): () => void {
    ensureMounted();
    const { content, type = 'info', duration, key, onClose } = config;

    // Dedup by key
    if (key) {
      const existing = messageState.messages.find((m) => m.key === key);
      if (existing) return () => {};
    }

    const duplicateCloser = suppressDuplicateMobileMessage(type, content);
    if (duplicateCloser) return duplicateCloser;
    const id = ++seed;
    const item = {
      id,
      type,
      content,
      duration: resolveDuration(type, duration),
      key,
      onClose,
    };
    messageState.messages.push(item);
    if (item.duration > 0) {
      setTimeout(() => removeMessage(id), item.duration * 1000);
    }
    return () => removeMessage(id);
  },

  destroy(): void {
    clearMessages();
  },
};

export default message;
