import { afterEach, expect, it } from 'vitest';
import { copyInlineEmojiSelection, readInlineEmojiClipboard } from './inlineEmojiClipboard';

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

it('copies only the selected mixed text and emoji, with a readable external fallback', () => {
  const host = document.createElement('p');
  const token = '[[ln-emoji:jian-tuan-v1:gentle-smile]]';
  host.innerHTML = `前缀文字😀<img alt="微笑" data-inline-emoji-token="${token}">后缀`;
  document.body.append(host);
  const range = document.createRange();
  range.setStart(host.firstChild!, 2);
  range.setEnd(host.lastChild!, 1);
  window.getSelection()?.addRange(range);
  const values = new Map<string, string>();
  const clipboardData = {
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) || '',
  };
  const event = new Event('copy', { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: clipboardData });
  copyInlineEmojiSelection(event);
  expect(event.defaultPrevented).toBe(true);
  expect(values.get('text/plain')).toBe('文字😀[微笑]后');
  expect(readInlineEmojiClipboard(event)).toBe(`文字😀${token}后`);
});

it('leaves ordinary text copying and unknown clipboard formats to the browser', () => {
  const host = document.createElement('p');
  host.textContent = '普通文字😀';
  document.body.append(host);
  const range = document.createRange();
  range.selectNodeContents(host);
  window.getSelection()?.addRange(range);
  const event = new Event('copy', { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => 'unknown' } });
  copyInlineEmojiSelection(event);
  expect(event.defaultPrevented).toBe(false);
  expect(readInlineEmojiClipboard(event)).toBeNull();
});

it('restores native HTML clipboard emoji without inserting markup or executable content', () => {
  const token = '[[ln-emoji:jian-tuan-v1:celebrate]]';
  const event = new Event('paste') as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: {
    getData: (type: string) => type === 'text/html'
      ? `<span>你好😀</span><img data-inline-emoji-token="${token}" onerror="alert(1)"><br>下一行<script>unwanted()</script>`
      : '',
  } });
  expect(readInlineEmojiClipboard(event)).toBe(`你好😀${token}\n下一行`);
});
