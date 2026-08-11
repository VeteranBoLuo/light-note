import type { Component } from 'vue';

type NoteEditorType = 'html' | 'markdown' | string | null | undefined;

let tinyMceRuntimePromise: Promise<Component> | null = null;
let markdownRuntimePromise: Promise<Component> | null = null;

function preloadPublicAsset(href: string, as: 'style' | 'script') {
  if (typeof document === 'undefined' || document.head.querySelector(`link[data-note-editor-asset="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = as;
  link.href = href;
  link.dataset.noteEditorAsset = href;
  document.head.appendChild(link);
}

function preloadTinyMcePublicAssets() {
  if (typeof document === 'undefined') return;
  const theme = document.documentElement.getAttribute('data-theme') === 'night' ? 'oxide-dark' : 'oxide';
  preloadPublicAsset(`/tinymce/skins/ui/${theme}/skin.min.css`, 'style');
  if (!String(document.documentElement.lang || 'zh-CN').toLowerCase().startsWith('en')) {
    preloadPublicAsset('/tinymce/langs/zh_CN.js', 'script');
  }
}

function retryableImport(
  loader: () => Promise<Component>,
  current: () => Promise<Component> | null,
  save: (value: Promise<Component> | null) => void,
) {
  const cached = current();
  if (cached) return cached;
  const request = loader().catch((error) => {
    save(null);
    throw error;
  });
  save(request);
  return request;
}

export function loadTinyMceRuntime() {
  return retryableImport(
    () => import('./TinyMceEditorRuntime.vue').then((module) => module.default),
    () => tinyMceRuntimePromise,
    (value) => {
      tinyMceRuntimePromise = value;
    },
  );
}

export function loadMarkdownRuntime() {
  return retryableImport(
    () => import('./MarkdownCodeMirror.vue').then((module) => module.default),
    () => markdownRuntimePromise,
    (value) => {
      markdownRuntimePromise = value;
    },
  );
}

export function preloadNoteEditorRuntime(type: NoteEditorType) {
  if (String(type || 'html').toLowerCase() === 'markdown') return loadMarkdownRuntime();
  preloadTinyMcePublicAssets();
  return loadTinyMceRuntime();
}
