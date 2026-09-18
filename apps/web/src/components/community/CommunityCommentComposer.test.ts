import { createApp, nextTick, h, ref } from 'vue';
import { expect, it, vi } from 'vitest';
import Composer from './CommunityCommentComposer.vue';
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'test' }) }));
vi.mock('@/composables/useCommunityChatEmojiRecent', () => ({ useCommunityChatEmojiRecent: () => ({ recent: [], remember: vi.fn() }) }));
vi.mock('@/components/communityChat/ChatEmojiPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/communityChat/ChatInlineEmojiText.vue', () => ({ default: { props: ['content'], template: '<span>{{ content }}</span>' } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
it('quotes the reply target and cancels it without clearing the draft', async () => {
  const cancel = vi.fn(), update = vi.fn();
  const host = document.createElement('div');
  const app = createApp(Composer, { modelValue: '保留我的草稿', busy: false, replying: '作者', quote: '原评论', onCancelReply: cancel, 'onUpdate:modelValue': update });
  app.mount(host);
  await nextTick();
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  expect(host.querySelector('textarea')?.value).toBe('保留我的草稿');
  expect(host.querySelector('.comment-reply-quote')?.textContent).toContain('原评论');
  (host.querySelector('[aria-label="community.feed.cancelReply"]') as HTMLButtonElement).click();
  expect(cancel).toHaveBeenCalledOnce();
  expect(update).not.toHaveBeenCalled();
  app.unmount();
});

it('renders custom emoji inside the editable draft and returns to plain text when cleared', async () => {
  const value = ref('你好[[ln-emoji:jian-tuan-v1:gentle-smile]]世界');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ setup: () => () => h(Composer, {
    modelValue: value.value, busy: false,
    'onUpdate:modelValue': (next: string) => { value.value = next; },
  }) });
  app.mount(host);
  await nextTick();
  await nextTick();
  const editor = host.querySelector('[contenteditable="true"]')!;
  expect(editor.textContent).toBe('你好世界');
  expect(editor.querySelectorAll('img')).toHaveLength(1);
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.querySelector('.emoji-draft-preview')).toBeNull();
  const emoji = editor.querySelector('img')!;
  const pressLeft = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: -1 });
  emoji.dispatchEvent(pressLeft);
  expect(pressLeft.defaultPrevented).toBe(true);
  expect(window.getSelection()?.anchorNode).toBe(editor.firstChild);
  expect(window.getSelection()?.anchorOffset).toBe(2);
  const pressRight = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 1 });
  emoji.dispatchEvent(pressRight);
  expect(pressRight.defaultPrevented).toBe(true);
  expect(window.getSelection()?.anchorOffset).toBe(2);
  // The later click must not move the caret a second time.
  emoji.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: -1 }));
  expect(window.getSelection()?.anchorNode).toBe(editor);
  expect(window.getSelection()?.anchorOffset).toBe(2);
  for (const options of [{ button: 2 }, { shiftKey: true }, { detail: 2 }]) {
    const nativeSelection = new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...options });
    emoji.dispatchEvent(nativeSelection);
    expect(nativeSelection.defaultPrevented).toBe(false);
  }
  window.getSelection()?.removeAllRanges();

  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  editor.dispatchEvent(enter);
  await nextTick();
  await nextTick();
  expect(enter.defaultPrevented).toBe(true);
  expect(value.value).toBe('你好[[ln-emoji:jian-tuan-v1:gentle-smile]]\n世界');
  value.value = '';
  await nextTick();
  await nextTick();
  expect(host.querySelector('[contenteditable="true"]')).toBeNull();
  expect(host.querySelector('textarea')?.value).toBe('');
  app.unmount();
  host.remove();
});
