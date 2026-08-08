/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 可选的公开爱发电创作者主页覆盖；不得填写 API Token 或其他凭据。 */
  readonly VITE_AFDIAN_SUPPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const Component: DefineComponent<{}, {}, any>;
  export default Component;
}
