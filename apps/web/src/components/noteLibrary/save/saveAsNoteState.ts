import { reactive } from 'vue';
import type { SaveAsNoteOptions, SaveAsNoteRequest } from '@/composables/useSaveAsNote';
export interface NoteSaveState {
  options: SaveAsNoteOptions;
  frozen: SaveAsNoteOptions | null;
  noteId: string;
  tagsDone: boolean;
  projectDone: boolean;
  uncertain: boolean;
}
const sourceStates = new Map<string, unknown>();
export function retainNoteSaveSource<T>(owner: string, key: string, create: () => T): T {
  const id = `${owner}:${key}`;
  if (!sourceStates.has(id)) { sourceStates.clear(); sourceStates.set(id, create()); }
  return sourceStates.get(id) as T;
}
const drafts = new Map<string, NoteSaveState>();
export function resetNoteSaveDrafts() {
  drafts.clear();
  sourceStates.clear();
}
export function getNoteSaveState(owner: string, request: SaveAsNoteRequest): NoteSaveState {
  const key = `${owner}:${request.sourceKey}`;
  let state = drafts.get(key);
  if (!state) {
    drafts.clear();
    state = reactive({
      options: {
        title: request.title.slice(0, 255),
        parentId: null,
        tags: [],
        projectId: request.projectId || '',
        thoughts: '',
        saveFormat: request.saveFormat,
      },
      frozen: null,
      noteId: '',
      tagsDone: false,
      projectDone: false,
      uncertain: false,
    });
    drafts.set(key, state);
  }
  if (!state.frozen) state.options.saveFormat = request.saveFormat;
  return state;
}
export function freezeNoteSaveOptions(state: NoteSaveState) {
  state.frozen ||= { ...state.options, title: state.options.title.trim(), tags: [...state.options.tags] };
  return state.frozen;
}
