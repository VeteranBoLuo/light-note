import { createApp, h, nextTick, ref } from 'vue';
import { describe, it, expect, vi } from 'vitest';
import TodoOrganizationFields from './TodoOrganizationFields.vue';
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/useUser', () => ({ default: () => ({ id: 'owner' }) }));
vi.mock('@/api/todoApi', () => ({ getTodoLists: async () => ({ status: 200, data: { items: [] } }) }));
vi.mock('@/api/tagSpace', () => ({ fetchSelectableTags: async () => ['a','b','c','d','e'].map(id => ({ id, name: id })) }));
vi.mock('@/components/manage/tagEditMg/TagEditorDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({ default: {
  props: ['value', 'options'], emits: ['change'],
  setup(props: any, { emit }: any) { return () => h('div', props.options.map((option: any) => h('button', {
    'data-tag': option.value, disabled: option.disabled,
    onClick: () => emit('change', props.value.includes(option.value) ? props.value.filter((id: string) => id !== option.value) : [...props.value, option.value]),
  }, option.label))); },
} }));
describe('todo tag limit', () => {
  it('four selected tags disable additions but allow removal and replacement', async () => {
    const selected = ref(['a','b','c','d']);
    const host = document.createElement('div'); document.body.append(host);
    const app = createApp({ render: () => h(TodoOrganizationFields, { showList: false, tagIds: selected.value, 'onUpdate:tagIds': (value: string[]) => { selected.value = value; } }) });
    try {
      app.mount(host); await new Promise(resolve => setTimeout(resolve, 0)); await nextTick();
      const button = (id: string) => host.querySelector(`[data-tag="${id}"]`) as HTMLButtonElement;
      expect(button('e').disabled).toBe(true);
      expect(button('a').disabled).toBe(false);
      button('a').click(); await nextTick();
      expect(button('e').disabled).toBe(false);
      button('e').click(); await nextTick();
      expect(selected.value).toEqual(['b','c','d','e']);
      expect(button('a').disabled).toBe(true);
    } finally { app.unmount(); host.remove(); }
  });
});
