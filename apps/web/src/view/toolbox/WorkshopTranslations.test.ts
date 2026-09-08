import { describe, it, expect } from 'vitest';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'node:fs';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
function keys(value: any, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, item]) =>
    typeof item === 'string' ? [prefix + key] : keys(item, prefix + key + '.'),
  );
}
describe('workshop translation paths', () => {
  it('resolves actual UI keys and all three template paths in Chinese and English', () => {
    const paths = [
      'src/view/toolbox/components/KnowledgeWorkspace.vue',
      'src/components/workbenches/WorkshopProjectEntry.vue',
      'src/components/resourceActions/ResourceProjectDialog.vue',
      'src/view/toolbox/ToolboxHome.vue',
      'src/view/toolbox/ToolboxTask.vue',
    ];
    const staticKeys = paths.flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/\bt\(['"](toolbox\.[\w.]+)['"]/g)]
        .map((m) => m[1])
        .filter((key) => !key.endsWith('.')),
    );
    for (const [locale, messages] of Object.entries({ 'zh-CN': zh, 'en-US': en })) {
      const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } });
      for (const key of [
        ...staticKeys,
        ...keys(zh.toolbox.project, 'toolbox.project.'),
        ...keys(zh.toolbox.workspace, 'toolbox.workspace.'),
      ])
        expect(i18n.global.te(key), `${locale}: ${key}`).toBe(true);
    }
  });
});
