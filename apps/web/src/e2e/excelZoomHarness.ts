import { applyUiDensity } from '@/composables/useUiDensity';
import { createApp, h, ref } from 'vue';
import '@/assets/css/theme.less';
import '@/assets/css/mobile-rendering-baseline.less';
import ExcelJS from 'exceljs';
import VueOfficeExcel from '@vue-office/excel/lib/v3/vue-office-excel.mjs';
import '@vue-office/excel/lib/v3/index.css';

const workbook = new ExcelJS.Workbook();
const params = new URLSearchParams(location.search);
for (const name of ['坐标验收', '第二张表']) {
  const sheet = workbook.addWorksheet(name);
  for (let row = 1; row <= 100; row++) {
    sheet.addRow(Array.from({ length: 26 }, (_, col) => `${row}:${col + 1}`));
  }
  if (params.has('searchRegression')) {
    sheet.getCell('A1').value = '预算 Alpha';
    sheet.getCell('B2').value = 0.125;
    sheet.getCell('B2').numFmt = '0.00%';
    sheet.getCell('C3').value = { formula: '1+1', result: 2 };
    sheet.mergeCells('D4:F4');
    sheet.getCell('D4').value = '合并单元格';
  }
}
applyUiDensity(params.get('density'), params.get('renderProfile') === 'mobile');
(window as any).setDensity = (preference: string) =>
  applyUiDensity(preference, params.get('renderProfile') === 'mobile');
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const csvContent =
  '来源资料,价格,支持平台,团队协作,离线能力\r\n材料 1 · 对比方案,39 元 / 人 / 月,支持,支持,支持\r\n材料 2 · 对比方案,未提供,支持,支持,支持\r\n"含,逗号","第一行\n第二行",00123,=1+1,12345678901234567890';
const buffer = params.has('csv')
  ? new TextEncoder().encode(
      params.get('csv') === 'invalid'
        ? '标题,"未闭合'
        : params.get('csv') === 'empty'
          ? ''
          : params.get('csv') === 'large'
            ? Array.from({ length: 205 }, (_, index) => `第 ${index + 1} 行,00123,内容`).join('\n')
            : csvContent,
    )
  : await workbook.xlsx.writeBuffer();
if (params.has('fullPreview')) {
  const { createPinia, setActivePinia } = await import('pinia');
  const pinia = createPinia();
  setActivePinia(pinia);
  const [
    { default: FilePreview },
    { createI18n },
    { default: zh },
    { default: en },
    { default: GlobalSearch },
    { createRouter, createMemoryHistory },
  ] = await Promise.all([
    import('@/components/FilePreview.vue'),
    import('vue-i18n'),
    import('@/i18n/locales/zh-CN'),
    import('@/i18n/locales/en-US'),
    import('@/components/search/GlobalSearch.vue'),
    import('vue-router'),
  ]);
  await import('@/assets/css/index.less');
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)]));
  const visible = ref(true);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/cloudSpace', component: { render: () => null } }],
  });
  await router.push('/cloudSpace');
  createApp({
    render: () =>
      h('div', [
        params.has('searchRegression') ? h(GlobalSearch) : null,
        h(FilePreview, {
          visible: visible.value,
          'onUpdate:visible': (value: boolean) => {
            visible.value = value;
          },
          previewAccess: { kind: 'share', token: 'fixture' },
          fileInfo: {
            id: 'fixture',
            fileName: params.get('fileName') ?? (params.has('csv') ? '方案对比表.csv' : '坐标验收.xlsx'),
            category: params.get('category') ?? (params.has('csv') ? 'text' : 'excel'),
            fileType:
              params.get('fileType') ??
              (params.has('csv') ? 'text/plain' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            fileUrl: url,
          },
        }),
      ]),
  })
    .use(pinia)
    .use(router)
    .use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }))
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
