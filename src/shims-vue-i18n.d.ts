// Vue 3 的全局属性类型扩展
import { i18n } from './i18n';

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $t: typeof i18n.global.t;
  }
}