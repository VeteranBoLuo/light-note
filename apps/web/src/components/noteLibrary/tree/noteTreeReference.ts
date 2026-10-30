import type { InjectionKey, Ref } from 'vue';

/**
 * 编辑页向页面树提供参考栏动作。页面树递归渲染，用注入避免逐层透传；
 * 笔记库页不提供该上下文，菜单与节点标识保持原样。
 */
export interface NoteTreeReferenceContext {
  referencedNoteId: Readonly<Ref<string | null>>;
  currentNoteId: Readonly<Ref<string | null>>;
  reference: (noteId: string, title: string) => void;
  cancelReference: () => void;
  openInNewWindow: (noteId: string) => void;
}

export const NOTE_TREE_REFERENCE_CONTEXT: InjectionKey<NoteTreeReferenceContext> = Symbol('noteTreeReference');
