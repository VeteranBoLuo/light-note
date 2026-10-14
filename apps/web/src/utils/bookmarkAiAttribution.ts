export type BookmarkAiFields = { name?: string; description?: string; relatedTags?: string[] };

/** Ephemeral attribution only. Values stay in this form; telemetry sends no content. */
export function createBookmarkAiAttribution(
  recordOutcome: (requestId: string, adoptionKind: 'draft' | 'saved') => unknown,
) {
  const fields = new Map<'name' | 'description', { requestId: string; value: string }>();
  const tags = new Map<string, string>();
  let revision = 0;
  const record = (requestId: string, kind: 'draft' | 'saved') => {
    try {
      void Promise.resolve(recordOutcome(requestId, kind)).catch(() => undefined);
    } catch {
      /* Telemetry cannot interrupt form or save state. */
    }
  };
  function reset() {
    revision++;
    fields.clear();
    tags.clear();
  }
  function prepareSave(data: BookmarkAiFields) {
    const requests = new Set<string>();
    for (const [field, source] of fields) {
      if (source.value && String(data[field] || '').trim() === source.value) requests.add(source.requestId);
    }
    for (const tag of data.relatedTags || []) {
      const requestId = tags.get(tag);
      if (requestId) requests.add(requestId);
    }
    const capturedRevision = revision;
    let recorded = false;
    return () => {
      if (recorded) return;
      recorded = true;
      for (const requestId of requests) record(requestId, 'saved');
      if (revision === capturedRevision) reset();
    };
  }
  return {
    filled(requestId: string, data: BookmarkAiFields, changed: ('name' | 'description')[], addedTags: string[]) {
      if (!requestId || (!changed.length && !addedTags.length)) return;
      revision++;
      for (const field of changed) fields.set(field, { requestId, value: String(data[field] || '').trim() });
      for (const tag of addedTags) tags.set(tag, requestId);
      record(requestId, 'draft');
    },
    prepareSave,
    saved(data: BookmarkAiFields) {
      prepareSave(data)();
    },
    reset,
  };
}
