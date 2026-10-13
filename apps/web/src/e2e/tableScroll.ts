import { createApp, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import type { Column } from '@/components/base/BasicComponents/BTable/config';
import { applyUiDensity } from '@/composables/useUiDensity';
import '@/assets/css/index.less';

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') || 'day';
applyUiDensity('medium');
const columns = ref<Column[]>([]);
const rows = ref<Record<string, string | number>[]>([]);
const virtual = ref(false);
const selectable = ref(false);
const fixture = {
  density: (value: string) => applyUiDensity(value),
  set(mode: string, empty = false) {
    virtual.value = mode === 'virtual';
    selectable.value = mode === 'mixed';
    const widths =
      mode === 'mixed'
        ? ['20%', undefined, 'var(--ui-layout-180, 180px)', '2fr']
        : Array(mode === 'narrow' ? 2 : 14).fill('var(--ui-layout-180, 180px)');
    columns.value = widths.map((width, index) => ({
      key: `f${index}`,
      title: `列 ${index + 1} · Column ${index + 1}`,
      width,
      ellipsis: false,
    }));
    rows.value = empty
      ? []
      : Array.from({ length: virtual.value ? 1000 : 6 }, (_, id) =>
          Object.fromEntries([
            ['id', id],
            ...columns.value.map((column, index) => [column.key, `R${id} / C${index + 1}`]),
          ]),
        );
  },
};
(window as any).tableFixture = fixture;
fixture.set('wide');
const app = createApp({
  render: () =>
    h(BTable, {
      columns: columns.value,
      data: rows.value,
      virtual: virtual.value,
      selectable: selectable.value,
      fill: true,
    }),
});
app.use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }));
app.mount('#app');
const style = document.createElement('style');
style.textContent = `html,body,#app{margin:0;width:100%;height:100%;min-width:0}
  #app{box-sizing:border-box;padding:var(--ui-space-16,16px)}
  .table-body{scrollbar-gutter:stable}`;
document.head.append(style);
