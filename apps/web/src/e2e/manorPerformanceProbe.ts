// Opt-in, isolated browser evidence. Never loaded by the application entry.
if (new URLSearchParams(location.search).has('performance')) {
  const output = document.createElement('output');
  output.id = 'manor-performance';
  const visible = new URLSearchParams(location.search).get('performance') === 'visible';
  output.hidden = !visible;
  if (visible) output.style.cssText = 'box-sizing:border-box;position:fixed;right:var(--ui-space-12,12px);bottom:var(--ui-space-12,12px);z-index:9999;max-width:calc(100% - 2 * var(--ui-space-12,12px));padding:var(--ui-space-8,8px);font:var(--ui-font-12,12px)/1.5 system-ui;color:#213c2b;background:#fffef0f2;border:1px solid #879d77;border-radius:6px;white-space:pre-line;pointer-events:none';
  document.body.append(output);
  document.addEventListener(
    'load',
    (event) => {
      if (!(event.target instanceof HTMLIFrameElement)) return;
      const frame = event.target,
        win = frame.contentWindow,
        doc = frame.contentDocument;
      if (!win || !doc?.body) return;
      const perf = win.performance;
      const tasks: { start: number; duration: number }[] = [];
      const inputs: { time: number; delay: number }[] = [];
      doc.addEventListener(
        'pointerdown',
        (event) => {
          if (inputs.length < 20)
            inputs.push({ time: Math.round(perf.now()), delay: Math.max(0, Math.round(perf.now() - event.timeStamp)) });
        },
        true,
      );
      const Observer = (win as Window & { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver;
      const observer = new Observer((list) =>
        tasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration }))),
      );
      if (Observer.supportedEntryTypes.includes('longtask')) observer.observe({ type: 'longtask', buffered: true });
      const frames: unknown[] = [];
      const frameObserver = new Observer((list) => frames.push(...list.getEntries().map((entry) => entry.toJSON())));
      if (Observer.supportedEntryTypes.includes('long-animation-frame'))
        frameObserver.observe({ type: 'long-animation-frame', buffered: true });
      let revealed = 0,
        painted = 0;
      const sample = () => {
        const images = [...doc.images].filter(
          (img) => img.getBoundingClientRect().width && img.getBoundingClientRect().height,
        );
        const missing = images
          .filter((img) => !img.complete || !img.naturalWidth)
          .map((img) => new URL(img.currentSrc || img.src).pathname);
        if (!revealed && doc.querySelector('.garden-scene') && !doc.querySelector('.garden-loader'))
          revealed = perf.now();
        if (!painted && revealed && !missing.length) painted = perf.now();
        const resources = (perf.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) =>
          e.name.includes('/manor/'),
        );
        const evidence = {
          elapsed: Math.round(perf.now()),
          revealed: Math.round(revealed),
          painted: Math.round(painted),
          interactive: Math.round(perf.getEntriesByName('manor-interactive')[0]?.startTime || 0),
          phase: doc.documentElement.dataset.startupPhase,
          visibility: doc.visibilityState,
          hostVisibility: document.visibilityState,
          cachedAssets: Number(doc.documentElement.dataset.cachedAssets || 0),
          inputs,
          resources: resources.map((e) => new URL(e.name).pathname),
          missing,
          images: images.length,
          bytes: resources.reduce((n, e) => n + e.encodedBodySize, 0),
          transferBytes: resources.reduce((n, e) => n + e.transferSize, 0),
          networkRequests: resources.filter(e => e.transferSize > 0).length,
          requests: resources.length,
          longTasks: tasks,
          totalBlocking: Math.round(tasks.reduce((n, e) => n + Math.max(0, e.duration - 50), 0)),
          measures: perf
            .getEntriesByType('measure')
            .map((e) => ({ name: e.name, duration: Math.round(e.duration), start: Math.round(e.startTime) })),
          frames,
          largest: resources
            .map((e) => ({
              path: new URL(e.name).pathname,
              bytes: e.encodedBodySize,
              duration: Math.round(e.duration),
            }))
            .sort((a, b) => b.bytes - a.bytes)
            .slice(0, 15),
          canvases: [...doc.querySelectorAll('canvas')].map((c) => ({
            cls: c.className,
            width: c.width,
            height: c.height,
            preparation: c.dataset.preparation,
          })),
        };
        output.dataset.evidence = JSON.stringify(evidence);
        output.textContent = visible ? `可交互：${evidence.interactive || '准备中'} ms · 素材：${evidence.measures.find(entry => entry.name === 'manor-assets-preparation')?.duration ?? '准备中'} ms · 水面：${evidence.measures.find(entry => entry.name === 'manor-water-preparation')?.duration ?? '准备中'} ms\n资源：${evidence.requests} · 复用：${evidence.cachedAssets} 张 · 网络：${Math.round(evidence.transferBytes / 1024)} KiB\n阶段：${evidence.phase} · 场景 ${evidence.visibility} / 宿主 ${evidence.hostVisibility}` : JSON.stringify(evidence);
      };
      // Safari may pause iframe frames while its window is occluded. Keep the
      // final ready evidence even when the bounded periodic sampler has ended.
      const finalSample = (message: MessageEvent) => {
        if (message.source !== win || message.origin !== location.origin || message.data?.type !== 'lightnote-manor'
          || !['ready', 'load-error'].includes(message.data.action)) return;
        if (frame.isConnected) sample();
        window.removeEventListener('message', finalSample);
      };
      window.addEventListener('message', finalSample);
      win.addEventListener('pagehide', () => window.removeEventListener('message', finalSample), {once:true});
      sample();
      const timer = setInterval(sample, 250);
      setTimeout(() => {
        sample();
        clearInterval(timer);
        observer.disconnect();
        frameObserver.disconnect();
      }, 30000);
    },
    true,
  );
}

// Capture the first visible animal frames, including the asynchronous 2D/3D
// handover. This is opt-in fixture evidence, never application telemetry.
if (new URLSearchParams(location.search).has('animalFrames')) {
  const output = document.createElement('output');
  output.id = 'manor-animal-frames'; output.hidden = true; document.body.append(output);
  document.addEventListener('load', event => {
    if (!(event.target instanceof HTMLIFrameElement)) return;
    const frame = event.target, doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc || !win) return;
    const samples: unknown[] = [], deadline = win.performance.now() + 30000; let start = 0;
    const sample = (time: number) => {
      const animals = doc.querySelector<HTMLCanvasElement>('.critter-layer');
      const stage = doc.querySelector<HTMLElement>('.scene-stage');
      if (animals?.dataset.frog && stage) {
        if (!start) start = time;
        const transform = stage.style.transform.match(/-?\d*\.?\d+/g)?.map(Number);
        const read = (value?: string) => value ? JSON.parse(value) : null;
        samples.push({ time: time - start, transform, frog: read(animals.dataset.frog), rabbit: read(animals.dataset.rabbit),
          birds: read(animals.dataset.birds), dragonfly: read(animals.dataset.dragonfly),
          models: read(doc.querySelector<HTMLCanvasElement>('.animal-model-layer')?.dataset.models),
          visitors: read(doc.querySelector<HTMLCanvasElement>('.companion-layer')?.dataset.visitors) });
        output.textContent = JSON.stringify(samples);
      }
      if ((!start ? time < deadline : time - start < 3000) && samples.length < 180 && frame.isConnected) win.requestAnimationFrame(sample);
    };
    win.requestAnimationFrame(sample);
  }, true);
}
