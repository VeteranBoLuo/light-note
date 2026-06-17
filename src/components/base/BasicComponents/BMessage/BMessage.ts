import { createVNode, render } from 'vue';
import BMessageContainer from './BMessageContainer.vue';
import { messageState } from './messageState';
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

function remove(id: number) {
  const idx = messageState.messages.findIndex((m) => m.id === id);
  if (idx === -1) return;
  const item = messageState.messages[idx];
  messageState.messages.splice(idx, 1);
  item.onClose?.();
}

function add(
  type: MessageType,
  content: string,
  duration?: number,
  onClose?: () => void,
): () => void {
  ensureMounted();
  const id = ++seed;
  const item = {
    id,
    type,
    content,
    duration: duration ?? 3,
    onClose,
  };
  messageState.messages.push(item);
  if (item.duration > 0) {
    setTimeout(() => remove(id), item.duration * 1000);
  }
  return () => remove(id);
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
    const { content, type = 'info', duration = 3, key, onClose } = config;

    // Dedup by key
    if (key) {
      const existing = messageState.messages.find((m) => m.key === key);
      if (existing) return () => {};
    }

    const id = ++seed;
    const item = {
      id,
      type,
      content,
      duration,
      key,
      onClose,
    };
    messageState.messages.push(item);
    if (item.duration > 0) {
      setTimeout(() => remove(id), item.duration * 1000);
    }
    return () => remove(id);
  },

  destroy(): void {
    const items = [...messageState.messages];
    messageState.messages.splice(0);
    items.forEach((item) => item.onClose?.());
  },
};

export default message;
