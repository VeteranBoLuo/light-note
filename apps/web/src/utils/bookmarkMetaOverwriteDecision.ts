import { createApp } from 'vue';
import BookmarkMetaOverwriteDecision from '@/components/bookmark/BookmarkMetaOverwriteDecision.vue';
import i18n from '@/i18n';

export type BookmarkMetaOverwriteFieldId = 'name' | 'description';

export interface BookmarkMetaOverwriteField {
  id: BookmarkMetaOverwriteFieldId;
  currentValue: string;
  generatedValue: string;
}

interface BookmarkMetaOverwriteDecisionOptions {
  signal?: AbortSignal;
}

let cancelActiveDecision: (() => void) | null = null;

export function requestBookmarkMetaOverwriteDecision(
  fields: BookmarkMetaOverwriteField[],
  options: BookmarkMetaOverwriteDecisionOptions = {},
): Promise<BookmarkMetaOverwriteFieldId[] | null> {
  if (options.signal?.aborted) return Promise.resolve(null);
  cancelActiveDecision?.();
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let settled = false;
    let app: ReturnType<typeof createApp> | null = null;

    const finish = (value: BookmarkMetaOverwriteFieldId[] | null) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', cancel);
      app?.unmount();
      app = null;
      container.remove();
      if (cancelActiveDecision === cancel) cancelActiveDecision = null;
      resolve(value);
    };
    const cancel = () => finish(null);
    cancelActiveDecision = cancel;
    options.signal?.addEventListener('abort', cancel, { once: true });
    app = createApp(BookmarkMetaOverwriteDecision, { fields, onResolve: finish });
    app.use(i18n);
    app.mount(container);
  });
}
