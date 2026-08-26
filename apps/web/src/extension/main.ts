import { createApp } from 'vue';
import ExtensionApp from './ExtensionApp.vue';
import '@/assets/css/index.less';
import './styles.less';
import i18n, { prepareInitialLocale } from '@/i18n';
import { applyDocumentTheme } from '@/utils/theme';
import { getExtensionTheme } from './storage';

async function mountExtension() {
  const app = createApp(ExtensionApp);
  app.use(i18n);
  const storedTheme = await getExtensionTheme();
  const theme = storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');
  applyDocumentTheme(theme);
  await prepareInitialLocale();
  app.mount('#app');
}

void mountExtension();
