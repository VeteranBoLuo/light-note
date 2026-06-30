import { isArray, isEmpty, mergeWith } from 'lodash-es';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ConfigMap } from '@/components/base/types';

function customizer(obj: any, src: any) {
  if (isArray(obj)) {
    return src;
  }
  if (isEmpty(src)) {
    return src;
  }
}

export function defineComponentConfig<T extends keyof ConfigMap>(config_id: string) {
  return defineStore(config_id, () => {
    const ref_config = ref({
      settings: {} as ConfigMap[T]['settings'],
      methods: {} as any,
      events: {} as any,
      styles: {} as any,
      classes: {} as any,
    });

    let default_config: Partial<ConfigMap[T]> = {};
    let config: Partial<ConfigMap[T]> = {};

    function setConfig(config_new: Partial<ConfigMap[T]>) {
      config = mergeWith(config, config_new, customizer);
      mergeConfig();
    }

    function setDefaultConfig(default_config_new: Partial<ConfigMap[T]>) {
      default_config = default_config_new;
      mergeConfig();
    }

    function mergeConfig() {
      const config_final = mergeWith(default_config, config, customizer);
      mergeWith(ref_config.value, config_final, customizer);
    }

    function useConfig() {
      return ref_config;
    }

    function useSettings() {
      return ref(ref_config.value.settings);
    }

    function useMethods() {
      return ref(ref_config.value.methods);
    }

    function useEvents() {
      return ref(ref_config.value.events);
    }

    function useStyles() {
      return ref(ref_config.value.styles);
    }

    function useClasses() {
      return ref(ref_config.value.classes);
    }

    return {
      useConfig,
      useSettings,
      useMethods,
      useEvents,
      useStyles,
      useClasses,
      setConfig,
      setDefaultConfig,
    };
  });
}

export function useComponentConfigStoreById<T extends keyof ConfigMap>(config_id: string) {
  const useConfigStore = defineComponentConfig<T>(config_id);
  return useConfigStore();
}

export function getConfigIdByPropsWithDefault(props: any, default_v: string) {
  return props.config_id === undefined ? default_v : props.config_id;
}
