// Opt-in, isolated browser evidence. Never loaded by the application entry.
if (new URLSearchParams(location.search).has('performance')) {
  const output = document.createElement('output');
  output.id = 'manor-performance';
  output.hidden = true;
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
      observer.observe({ type: 'longtask', buffered: true });
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
        output.textContent = JSON.stringify({
          elapsed: Math.round(perf.now()),
          revealed: Math.round(revealed),
          painted: Math.round(painted),
          interactive: Math.round(perf.getEntriesByName('manor-interactive')[0]?.startTime || 0),
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
        });
      };
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
