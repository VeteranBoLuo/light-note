import { expect, it } from 'vitest';
import { createPersonalSearchPreprocessor } from './personalSearchPreprocessor.js';
import { chunkResource, cleanText } from './personalKnowledgeText.js';

function input(content, contentType = 'markdown') {
  return {
    userId: 'synthetic',
    resourceType: 'note',
    resourceId: 'n',
    version: 'v1',
    title: '标题',
    content,
    contentType,
    target: { type: 'note-detail', id: 'n' },
    tagNames: ['alpha', '<b>beta</b>', 'alpha'],
    maxChunks: 12_000,
  };
}

it('isolates large HTML and Markdown preprocessing with exact chunk/hash/locator equivalence', async () => {
  const preprocessor = createPersonalSearchPreprocessor();
  try {
    for (const data of [
      input('# 章节\n' + 'large evidence 中文段落。'.repeat(6000) + '\n## 最后\nunique-tail'),
      input(
        '<h2>章节</h2><p>' + 'html &amp; evidence 中文。'.repeat(6000) + '</p><h2>尾部</h2><p>unique-tail</p>',
        'html',
      ),
    ]) {
      let timerRan = false;
      const timer = setTimeout(() => {
        timerRan = true;
      }, 0);
      const actual = await preprocessor.chunk(data);
      clearTimeout(timer);
      expect(timerRan).toBe(true);
      expect(actual).toEqual(chunkResource(data));
      expect(actual.at(-1).content).toContain('unique-tail');
    }
  } finally {
    await preprocessor.close();
  }
});

it('preserves the remaining chunk prefix and small-document behavior', async () => {
  const preprocessor = createPersonalSearchPreprocessor();
  try {
    const large = { ...input('evidence '.repeat(20_000)), maxChunks: 3 };
    expect(await preprocessor.chunk(large)).toEqual(chunkResource(large));
    expect(await preprocessor.chunk(input('short evidence'))).toEqual(chunkResource(input('short evidence')));
  } finally {
    await preprocessor.close();
  }
  await expect(preprocessor.chunk(input('short'))).rejects.toMatchObject({
    code: 'AI_PERSONAL_SEARCH_PREPROCESS_CLOSED',
  });
});

it('cancels in-flight work on close without leaving a worker or unresolved request', async () => {
  const preprocessor = createPersonalSearchPreprocessor();
  const pending = expect(preprocessor.chunk(input('private evidence '.repeat(100_000)))).rejects.toMatchObject({
    code: 'AI_PERSONAL_SEARCH_PREPROCESS_CLOSED',
  });
  await preprocessor.close();
  await pending;
  await preprocessor.close();
});

it('cleans large file chunks off-thread before taking the existing prefix', async () => {
  const processor = createPersonalSearchPreprocessor();
  let first = true;
  try {
    for (const content of [
      '<script>' + 'hidden content '.repeat(20_000) + '</script><p>visible &amp; 中文 evidence</p>',
      '<style>' + 'hidden style '.repeat(20_000) + '</style>',
      '<p>' + 'visible 中文 &nbsp; '.repeat(20_000) + '</p>',
    ]) {
      let timerRan = false;
      const timer = setTimeout(() => {
        timerRan = true;
      }, 0);
      const actual = await processor.fileText(content);
      clearTimeout(timer);
      if (first) expect(timerRan).toBe(true);
      first = false;
      expect(actual).toBe(cleanText(content).slice(0, 4000));
      expect(actual.length).toBeLessThanOrEqual(4000);
    }
    expect(await processor.fileText('<b>small &amp; text</b>')).toBe('small & text');
    expect(await processor.fileText(null)).toBe('');
    // The same worker continues to support structured note parsing.
    const note = input('long note evidence '.repeat(4000));
    expect(await processor.chunk(note)).toEqual(chunkResource(note));
  } finally {
    await processor.close();
  }
  await expect(processor.fileText('small')).rejects.toMatchObject({ code: 'AI_PERSONAL_SEARCH_PREPROCESS_CLOSED' });
});
