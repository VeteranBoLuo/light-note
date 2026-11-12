/// <reference types="vite/client" />

declare module 'virtual:lightnote-public-art' {
  const urls: Record<string, string>;
  export default urls;
}

declare module 'virtual:lightnote-pdf-cmaps' {
  const cMapUrl: string;
  export default cMapUrl;
}

interface ImportMetaEnv {
  /** 可选的公开爱发电创作者主页覆盖；不得填写 API Token 或其他凭据。 */
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const Component: DefineComponent<{}, {}, any>;
  export default Component;
}
