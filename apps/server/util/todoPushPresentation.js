function shortPlainText(value, maxCharacters) {
  return Array.from(String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, maxCharacters).join('');
}

export function todoPushPresentation(todo) {
  const title = shortPlainText(todo?.title, 32);
  const description = shortPlainText(todo?.description, 120);
  return {
    title: title ? `待办：${title}` : '轻笺待办提醒',
    body: description || '提醒时间到了，点击打开通知中心查看。',
  };
}
