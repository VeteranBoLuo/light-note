import { applyUiDensity } from '@/composables/useUiDensity';
import { createApp, h } from 'vue';
import '@/assets/css/theme.less';
import '@/assets/css/mobile-rendering-baseline.less';
import ExcelJS from 'exceljs';
import VueOfficeExcel from '@vue-office/excel/lib/v3/vue-office-excel.mjs';
import '@vue-office/excel/lib/v3/index.css';

const workbook = new ExcelJS.Workbook();
for (const name of ['坐标验收', '第二张表']) {
  const sheet = workbook.addWorksheet(name);
  for (let row = 1; row <= 100; row++) {
    sheet.addRow(Array.from({ length: 26 }, (_, col) => `${row}:${col + 1}`));
  }
}
const params = new URLSearchParams(location.search);
applyUiDensity(params.get('density'), params.get('renderProfile') === 'mobile');
(window as any).setDensity = (preference: string) =>
  applyUiDensity(preference, params.get('renderProfile') === 'mobile');
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const buffer = await workbook.xlsx.writeBuffer();
if (params.has('fullPreview')) {
  const { createPinia, setActivePinia } = await import('pinia');
  const pinia = createPinia();
  setActivePinia(pinia);
  const [{ default: FilePreview }, { createI18n }, { default: zh }] = await Promise.all([
    import('@/components/FilePreview.vue'),
    import('vue-i18n'),
    import('@/i18n/locales/zh-CN'),
  ]);
  await import('@/assets/css/index.less');
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)]));
  createApp({
    render: () =>
      h(FilePreview, {
        visible: true,
        previewAccess: { kind: 'share', token: 'fixture' },
        fileInfo: {
          id: 'fixture',
          fileName: '坐标验收.xlsx',
          category: 'excel',
          fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileUrl: url,
        },
      }),
  })
    .use(pinia)
    .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }))
    .mount('#app');
} else
  createApp({
    render: () =>
      h(
        'div',
        {
          style: 'position:fixed;inset:40px 20px 20px',
        },
        [
          h(VueOfficeExcel, {
            src: new Uint8Array(buffer).buffer,
            style: 'height:100%',
            onRendered: () => {
              document.body.dataset.ready = 'true';
            },
            onCellSelected: (cell: unknown) => {
              document.body.dataset.selected = JSON.stringify(cell);
            },
            onCellsSelected: (cells: unknown) => {
              document.body.dataset.range = JSON.stringify(cells);
            },
          }),
        ],
      ),
  }).mount('#app');
