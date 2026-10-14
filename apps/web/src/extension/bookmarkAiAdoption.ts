import { createBookmarkAiAttribution, type BookmarkAiFields } from '@/utils/bookmarkAiAttribution';
import { extensionRequest } from './api';

async function record(owner: string, requestId: string, adoptionKind: 'draft' | 'saved') {
  if (!owner) return;
  try {
    await extensionRequest('/api/common/recordAiEvent', {
      method: 'POST',
      requireAuth: true,
      expectedUserId: owner,
      silentAuthFailure: true,
      signal: AbortSignal.timeout(3000),
      body: {
        event: 'ai_skill_applied',
        dimensions: {
          measurementVersion: '2',
          skillId: 'bookmark.parse_url',
          requestId,
          adoptionKind,
          surface: 'browser_extension.bookmark',
          resourceType: 'bookmark',
          resourceCountBucket: '0',
          outcome: 'success',
        },
      },
    });
  } catch {
    /* A telemetry failure must not change the form, save result or session. */
  }
}

/** Owned by one side panel, retained across its form remounts, never persisted with the draft. */
export function createExtensionBookmarkAiAdoption() {
  let owner = '';
  let url = '';
  let generation = 0;
  let tracker = createTracker('');
  const suggestedTags = new Map<string, string>();
  function createTracker(actor: string) {
    return createBookmarkAiAttribution((requestId, kind) => record(actor, requestId, kind));
  }
  function reset() {
    generation++;
    tracker.reset();
    suggestedTags.clear();
  }
  return {
    setOwner(next: string) {
      if (next === owner) return;
      reset();
      owner = next;
      url = '';
      tracker = createTracker(owner);
    },
    setUrl(next: string) {
      if (next === url) return;
      reset();
      url = next;
    },
    begin() {
      const current = generation;
      return {
        current: () => current === generation,
        filled(requestId: string, before: BookmarkAiFields, after: BookmarkAiFields, newTags: string[]) {
          if (current !== generation || !owner || !requestId) return;
          const changed = (['name', 'description'] as const).filter((key) => after[key] !== before[key]);
          tracker.filled(
            requestId,
            after,
            changed,
            (after.relatedTags || []).filter((tag) => !before.relatedTags?.includes(tag)),
          );
          suggestedTags.clear();
          for (const tag of newTags) suggestedTags.set(tag, requestId);
        },
      };
    },
    selectNewTag(tag: string) {
      const requestId = suggestedTags.get(tag);
      if (requestId) tracker.filled(requestId, {}, [], [`name:${tag}`]);
    },
    prepareSave(data: BookmarkAiFields) {
      return tracker.prepareSave(data);
    },
    reset,
  };
}
export type ExtensionBookmarkAiAdoption = ReturnType<typeof createExtensionBookmarkAiAdoption>;
