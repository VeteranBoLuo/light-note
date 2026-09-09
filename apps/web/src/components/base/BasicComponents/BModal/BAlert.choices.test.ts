import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Alert from './Alert';

vi.mock('@/i18n', () => ({ default: { global: { t: (key: string) => key } } }));
const choices = [
  { value: 'current', label: '仅本次', description: '保留系列', confirmText: '删除本次' },
  { value: 'future', label: '本次及以后', description: '停止后续生成', confirmText: '删除本次及以后' },
  { value: 'series', label: '整个系列', confirmText: '删除整个系列' },
];
function open(onOk = vi.fn()) {
  Alert.alert({
    title: '删除待办',
    content: '<b>用户标题</b>',
    choices,
    defaultChoice: 'current',
    choiceLabel: '删除范围',
    okType: 'danger',
    cancelText: '取消',
    onOk,
  });
  return onOk;
}
afterEach(() => Alert.destroy());
describe('选择范围后统一确认', () => {
  it('默认仅本次，标题作为文本展示，选项不会立即执行删除', async () => {
    const onOk = open();
    const radios = document.querySelectorAll<HTMLButtonElement>('[role=radio]');
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.bAlert-choice-task')?.textContent).toBe('<b>用户标题</b>');
    expect(document.querySelector('.bAlert-choice-task b')).toBeNull();
    radios[1].click();
    await nextTick();
    expect(onOk).not.toHaveBeenCalled();
    const confirm = document.querySelector<HTMLButtonElement>('.bAlert-footer .danger_btn')!;
    expect(confirm.textContent).toContain('删除本次及以后');
    confirm.click();
    expect(onOk).toHaveBeenCalledWith('future');
  });
  it('方向键更新选择和焦点，取消不提交，重新打开恢复默认', async () => {
    const onOk = open();
    const radios = document.querySelectorAll<HTMLButtonElement>('[role=radio]');
    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await nextTick();
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radios[2]);
    document.querySelector<HTMLButtonElement>('.bAlert-footer .default_btn')!.click();
    expect(onOk).not.toHaveBeenCalled();
    open();
    expect(document.querySelector('[role=radio]')?.getAttribute('aria-checked')).toBe('true');
  });
  it('普通确认框仍传递无参数确认', () => {
    const onOk = vi.fn();
    Alert.alert({ title: '普通确认', content: '正文', onOk });
    expect(document.querySelector('[role=radio]')).toBeNull();
    document.querySelector<HTMLButtonElement>('.bAlert-footer .primary_btn')!.click();
    expect(onOk).toHaveBeenCalledWith(undefined);
  });
});
