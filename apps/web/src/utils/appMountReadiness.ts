interface ApplicationMountReadinessOptions {
  appRoot: Element;
  prepareLocale: () => Promise<unknown>;
  waitForInitialRoute: () => Promise<unknown>;
}

export function hasPrerenderedApplicationContent(appRoot: Element) {
  return appRoot.firstElementChild !== null;
}

type ContinuousAnimationSnapshot = {
  name: string;
  currentTime: number;
};

type NamedCssAnimation = Animation & {
  animationName: string;
};

function getContinuousCssAnimations(appRoot: Element): NamedCssAnimation[] {
  if (typeof appRoot.getAnimations !== 'function') return [];

  try {
    return appRoot.getAnimations({ subtree: true }).filter((animation): animation is NamedCssAnimation => {
      if (typeof (animation as Partial<NamedCssAnimation>).animationName !== 'string') return false;
      return animation.effect?.getTiming().iterations === Infinity;
    });
  } catch {
    return [];
  }
}

/**
 * 把预渲染 DOM 中持续 CSS 动画的相位同步给客户端 mount 后的新节点。
 *
 * Vue 客户端 mount 会同步替换预渲染节点。替换本身不会露出空白，但新节点的无限动画会
 * 从 0 重新开始；网络越慢，接管前后的相位差越明显。按动画名和 DOM 顺序做尽力匹配，
 * 不支持 Web Animations API、动画数量变化或赋值失败时安全跳过，不影响应用挂载。
 */
export function captureContinuousAnimationHandoff(
  appRoot: Element,
  now: () => number = () => performance.now(),
): () => void {
  const capturedAt = now();
  const snapshots = getContinuousCssAnimations(appRoot).flatMap<ContinuousAnimationSnapshot>((animation) =>
    typeof animation.currentTime === 'number'
      ? [{ name: animation.animationName, currentTime: animation.currentTime }]
      : [],
  );

  return () => {
    if (snapshots.length === 0) return;

    const elapsed = Math.max(0, now() - capturedAt);
    const pendingByName = new Map<string, ContinuousAnimationSnapshot[]>();
    for (const snapshot of snapshots) {
      const pending = pendingByName.get(snapshot.name) ?? [];
      pending.push(snapshot);
      pendingByName.set(snapshot.name, pending);
    }

    for (const animation of getContinuousCssAnimations(appRoot)) {
      const snapshot = pendingByName.get(animation.animationName)?.shift();
      if (!snapshot) continue;
      try {
        animation.currentTime = snapshot.currentTime + elapsed;
      } catch {
        // 浏览器可能将某些 CSS Animation 暴露为只读或已取消；单项失败不阻塞首屏。
      }
    }
  };
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
