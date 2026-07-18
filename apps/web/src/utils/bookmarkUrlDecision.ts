import { createVNode, render } from 'vue';
import BookmarkUrlDecision from '@/components/bookmark/BookmarkUrlDecision.vue';

interface BookmarkUrlDecisionOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface BookmarkUrlDecisionConfig {
  title: string;
  description: string;
  options: BookmarkUrlDecisionOption[];
  cancelText: string;
  recommendedText: string;
}

let cancelActiveDecision: (() => void) | null = null;

export function requestBookmarkUrlDecision(config: BookmarkUrlDecisionConfig): Promise<string | null> {
  cancelActiveDecision?.();
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      render(null, container);
      container.remove();
      if (cancelActiveDecision === cancel) cancelActiveDecision = null;
      resolve(value);
    };
    const cancel = () => finish(null);
    cancelActiveDecision = cancel;
    render(createVNode(BookmarkUrlDecision, { ...config, onResolve: finish }), container);
  });
}
