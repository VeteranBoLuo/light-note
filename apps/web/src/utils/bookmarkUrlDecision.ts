import { createApp } from 'vue';
import BookmarkUrlDecision from '@/components/bookmark/BookmarkUrlDecision.vue';
import i18n from '@/i18n';

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
    let app: ReturnType<typeof createApp> | null = null;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      app?.unmount();
      app = null;
      container.remove();
      if (cancelActiveDecision === cancel) cancelActiveDecision = null;
      resolve(value);
    };
    const cancel = () => finish(null);
    cancelActiveDecision = cancel;
    // 该弹窗由函数调用动态挂载，不在主 Vue 组件树中；必须显式安装 i18n，
    // 否则 BModal 内的 useI18n() 取不到应用上下文，用户会一直停在“识别中”。
    app = createApp(BookmarkUrlDecision, { ...config, onResolve: finish });
    app.use(i18n);
    app.mount(container);
  });
}
