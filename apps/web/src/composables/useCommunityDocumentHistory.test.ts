import { effectScope, nextTick, reactive, ref } from 'vue';
import { expect, it } from 'vitest';
import { useCommunityDocumentHistory } from './useCommunityDocumentHistory';
it('restores body and attachment membership together across typing, movement, deletion and redo', async () => {
  const scope = effectScope();
  const draft = reactive({ body: '正文', attachmentIds: ['image'] });
  const history = scope.run(() =>
    useCommunityDocumentHistory(draft, (value) => Object.assign(draft, value), ref(true)),
  )!;
  history.reset();
  draft.body = '正文更新';
  await nextTick();
  draft.body += '\n\n图片';
  draft.attachmentIds = [];
  history.record(true);
  await nextTick();
  history.undo();
  await nextTick();
  expect(draft).toEqual({ body: '正文更新', attachmentIds: ['image'] });
  history.redo();
  await nextTick();
  expect(draft).toEqual({ body: '正文更新\n\n图片', attachmentIds: [] });
  draft.body = '正文更新';
  history.record(true);
  await nextTick();
  history.undo();
  await nextTick();
  expect(draft.body).toContain('图片');
  history.undo();
  await nextTick();
  expect(draft.attachmentIds).toEqual(['image']);
  scope.stop();
});
