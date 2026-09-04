interface ApplicationMountReadinessOptions {
  appRoot: Element;
  prepareLocale: () => Promise<unknown>;
  waitForInitialRoute: () => Promise<unknown>;
}

export function hasPrerenderedApplicationContent(appRoot: Element) {
  return appRoot.firstElementChild !== null;
}

/**
 * 普通 SPA 空壳只需要准备语言；已经直出正文的公开页还要等首路由就绪。
 * 这样构建期首屏会一直可见，Vue 接管时也能立即绘制完整 RouterView。
 */
export async function waitForApplicationMountReadiness(options: ApplicationMountReadinessOptions) {
  const readiness: Promise<unknown>[] = [options.prepareLocale()];
  if (hasPrerenderedApplicationContent(options.appRoot)) {
    readiness.push(options.waitForInitialRoute());
  }
  await Promise.all(readiness);
}
