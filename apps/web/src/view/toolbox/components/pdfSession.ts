import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { useI18n } from 'vue-i18n';
import { inject, onActivated, onDeactivated, onBeforeUnmount, type InjectionKey } from 'vue';

export interface PdfSession {
  owner: symbol | null;
  read: () => Promise<File[]>;
}
export const pdfSessionKey: InjectionKey<PdfSession> = Symbol('pdf-session');
/** KeepAlive modes exchange the current bytes only on activation, never an earlier upload. */
export function usePdfSession(read: () => Promise<File[]>, accept?: (files: File[]) => void | Promise<void>) {
  const { t } = useI18n();
  const session = inject(pdfSessionKey, null);
  const owner = Symbol('pdf-mode');
  let generation = 0;
  let synchronizing = false;
  onDeactivated(() => {
    generation++;
  });
  onBeforeUnmount(() => {
    generation++;
  });
  const publish = () => {
    if (session && !synchronizing) {
      session.owner = owner;
      session.read = read;
    }
  };
  onActivated(async () => {
    const token = ++generation;
    if (!accept || !session || !session.owner || session.owner === owner) return;
    try {
      const previous = session.owner;
      const files = await session.read();
      if (session.owner !== previous || token !== generation) return;
      synchronizing = true;
      await accept(files);
      synchronizing = false;
      if (token === generation) publish();
    } catch {
      message.error(t('toolbox.local.localFailed'));
    } finally {
      synchronizing = false;
    }
  });
  return publish;
}
