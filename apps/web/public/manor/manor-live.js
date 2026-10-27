/* Account state and points are owned by the host's authenticated API, never this scene. */
function createManorRefreshInput(doc) {
  const pointers = new Set(), keys = new Set(), waiting = [];
  let timer, settling = false;
  const pressed = () => pointers.size || keys.size || settling;
  const flush = () => { if (!pressed()) waiting.splice(0).forEach(resolve => resolve()); };
  // pointerup/keyup precede the browser's click. Paint on the next task so the
  // control that received the press survives until its click has dispatched.
  const release = () => { settling = true; clearTimeout(timer); timer = setTimeout(() => { settling = false; flush(); }, 0); };
  const down = e => { pointers.add(e.pointerId); };
  const up = e => { pointers.delete(e.pointerId); release(); };
  const key = e => e.key === 'Enter' || e.code === 'Space';
  const keyDown = e => { if (key(e)) keys.add(e.code || e.key); };
  const keyUp = e => { if (key(e)) { keys.delete(e.code || e.key); release(); } };
  const blur = () => { pointers.clear(); keys.clear(); release(); };
  const listeners = [['pointerdown',down],['pointerup',up],['pointercancel',up],['keydown',keyDown],['keyup',keyUp]];
  listeners.forEach(([name, listener]) => doc.addEventListener(name, listener, true));
  doc.defaultView?.addEventListener('blur', blur);
  return {
    waitForRelease: () => pressed() ? new Promise(resolve => waiting.push(resolve)) : Promise.resolve(),
    destroy() {
      listeners.forEach(([name, listener]) => doc.removeEventListener(name, listener, true));
      doc.defaultView?.removeEventListener('blur', blur);
      clearTimeout(timer); pointers.clear(); keys.clear(); settling = false; flush();
    },
  };
}
(() => {
  const nonce = new URLSearchParams(location.search).get('bridge');
  const uiScript = document.currentScript.dataset.uiScript;
  if (!nonce || window.parent === window) return;
  let snapshot, busy = false, sequence = 0, ready = false, refreshing = null, syncedAt = performance.now();
  let activeCommand = null, readQueue = Promise.resolve();
  const waiting = new Map();
  const origin = location.origin;
  const refreshInput = createManorRefreshInput(document);
  const request = (action, payload = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    waiting.set(id, { resolve, reject });
    window.parent.postMessage({ type: 'lightnote-manor', nonce, id, action, payload }, origin);
  });
  let overlayOpen = false, overlayQueued = false;
  const syncOverlay = (force = false) => {
    if (!ready) return;
    const next = ['modal', 'tankProduction'].some(id => {
      const element = document.getElementById(id);
      return element && !element.hidden;
    });
    if (force || next !== overlayOpen) { overlayOpen = next; request('dialog', { open: next }); }
  };
  const queueOverlaySync = () => {
    if (overlayQueued) return;
    overlayQueued = true;
    // A panel can hand off to a detail in one click. Publish the final layer,
    // keeping one host history entry rather than briefly closing/reopening it.
    Promise.resolve().then(() => { overlayQueued = false; syncOverlay(); });
  };
  const backOverlay = () => {
    if (!document.getElementById('modal').hidden) backFromDialog();
    else closeTankManagement();
    // System back has already consumed the host entry. Re-register only if a
    // nested detail returned to the still-open atlas/panel.
    syncOverlay(true);
  };
  const apply = (target, next) => {
    for (const name of Object.keys(target)) if (!(name in next)) delete target[name];
    Object.assign(target, next);
  };
  const send = (target, action, args) => {
    if (busy) return Promise.reject(new Error('庄园操作正在处理中'));
    busy = true;
    document.documentElement.setAttribute('aria-busy', 'true');
    // Preserve the revision that the user actually saw, even if a background
    // calibration arrives while their pointer is held down.
    const revision = snapshot.revision;
    activeCommand = (async () => {
      if (refreshing) await refreshing;
      const next = await request('command', { action, args, revision });
      snapshot = next; syncedAt = performance.now();
      apply(target, next.state);
      return next.result;
    })().finally(() => {
      busy = false;
      activeCommand = null;
      document.documentElement.removeAttribute('aria-busy');
    });
    return activeCommand;
  };
  const methods = ['adopt','plant','water','harvest','fertilize','remove','buySeed','sellCrop','sellAllCrops',
    'convertBait','buyBait','buyFry','beginCast','resolveCast','selectBait','sell','release','buyback',
    'place','placeShow','unplace','fillEmptySlots','collect','collectSlot','pickPoop','deliverBirdSeed','pickBirdSeed',
    'buyPurifier','claimPurifier','buyFacility','collectCompost','upgradeComposter','upgradePurifier','startCraft','collectCraft','refillPollen',
    'pollinate','claimDailyWater','claimAllDailyWater','claimLevelReward','claimAllLevelRewards','claimCollection',
    'readAtlasEntry'];
  async function start(data) {
    snapshot = data; syncedAt = performance.now();
    if(typeof GardenStartup!=='undefined'&&GardenStartup.assetsReady&&!await GardenStartup.assetsReady)return;
    GardenModel.create = () => structuredClone(snapshot.state);
    for (const name of methods) {
      GardenModel[name] = async (target, ...args) => {
        args = args.filter(v => v !== FISH && typeof v !== 'function');
        if (name === 'resolveCast') args = [target.castId];
        if (name === 'buyFry') args = [];
        if (name !== 'readAtlasEntry') return send(target, name, args);
        // Reading entries is metadata: serialize receipts without holding
        // navigation or waiting for unrelated atlas images.
        const read = readQueue.catch(() => {}).then(async () => {
          if (activeCommand) await activeCommand.catch(() => {});
          if (!GardenModel.atlasEntryUnread(target, ...args)) return false;
          return send(target, name, args);
        });
        readQueue = read;
        return read;
      };
    }
    const script = document.createElement('script');
    script.src = uiScript;
    script.onload = async () => {
      if(typeof GardenStartup!=='undefined'&&!await GardenStartup.ready())return;
      ready = true;
      if(FarmStage.profile()==='mobile') {
        const prefetch=()=>GardenArea.prepare(FarmStage.cal().area==='bay'?FARM_CAL.mobileGarden:FARM_CAL.mobileBay,true);
        if(window.requestIdleCallback)requestIdleCallback(prefetch);else setTimeout(prefetch,0);
      }
      const modal = document.getElementById('modal');
      syncOverlay();
      new MutationObserver(queueOverlaySync).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
      resumeCatch().catch(() => {});
    };
    script.onerror = () => {if(typeof GardenStartup!=='undefined')GardenStartup.fail();else request('load-error');};
    document.body.append(script);
  }
  window.GardenLive = {
    get quests() { return snapshot?.quests || []; },
    get snapshot() { return snapshot; },
    get busy() { return busy; },
    get testing() { return Boolean(snapshot?.testing); },
    resetTest: () => request("reset-test"),
    restoreFormal: () => request("restore-formal"),
    exit: () => request('exit'),
    tasks: index => request('tasks', { index }),
    ledger: () => request('ledger'),
    dismissGuide: target => send(target, 'dismissGuide', []),
    claimSupply: (target, id) => send(target, 'claimSupply', [id]),
  };
  // Reloading between bait consumption and resolution resumes the same server cast.
  // A first companion already caught before a reload keeps the existing placement dialog.
  async function resumeCatch() {
    const pending = state.casting && state.castId;
    let result;
    if (pending) result = await GardenModel.resolveCast(state);
    else if (state.firstCompanionPending) {
      const fish = state.fish.find(f => f.id === state.firstCompanionPending);
      if (fish) result = { fish, firstCatch: true, discovered: false };
    }
    if (pending) update();
    if (result?.fish) await revealCaught(result, document.querySelector('#pondSpot'));
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window.parent || event.origin !== origin || data?.nonce !== nonce) return;
    if (data?.type === 'lightnote-manor-control' && ready) {
      if (data.action === 'close-dialog') backOverlay();
      else if (data.action === 'open-ledger') ledgerDialog();
      else if (data.action === 'navigation-back') {
        const allow = !overlayOpen && confirmManorExit();
        if (overlayOpen) backOverlay();
        request('navigation', { requestId: data.requestId, allow });
      }
      else if (data.action === 'back') {
        if (overlayOpen) backOverlay();else requestManorExit();
      }
      return;
    }
    if (data?.type !== 'lightnote-manor-reply') return;
    const waiter = waiting.get(data.id);
    if (!waiter) return;
    waiting.delete(data.id);
    if (data.error) waiter.reject(new Error(data.error));
    else waiter.resolve(data.value);
  });
  document.addEventListener('manor-overlay-change', queueOverlaySync);
  const readOnlyActions = new Set(['exit', 'close', 'dialog-back', 'atlas', 'atlas-filter', 'fish-detail', 'crop-detail', 'wildlife-detail']);
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]');
    if (busy && action && !readOnlyActions.has(action.dataset.action)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('unhandledrejection', event => {
    event.preventDefault();
    if (ready) {
      toast('操作未完成，请稍后重试');
      closeDialog();
      refresh(true)?.then(() => resumeCatch()).catch(() => {});
    }
  });
  const contentKey = value => JSON.stringify({ revision: value.revision, quests: value.quests,
    state: Object.fromEntries(Object.entries(value.state).filter(([key]) => key !== 'now')) });
  const refresh = (recover = false, background = false) => {
    if (!ready || document.hidden || navigator.onLine === false || busy || state.casting && !recover || refreshing) return;
    refreshing = request('get', { background }).then(async next => {
      await refreshInput.waitForRelease();
      const changed = contentKey(snapshot) !== contentKey(next);
      snapshot = next; syncedAt = performance.now(); apply(state, next.state);
      if (changed) { update(); FarmUI.refreshInventory(); }else refreshClocks();
    }).finally(() => { refreshing = null; });
    return refreshing;
  };
  document.addEventListener('visibilitychange', () => { refresh()?.catch(() => {}); });
  window.addEventListener('focus', () => { refresh()?.catch(() => {}); });
  // Only a visible formal scene calibrates across devices. Test saves stay
  // isolated; passive reads yield to foreground work in the shared scheduler.
  setInterval(() => {
    if (!ready || document.hidden) return;
    const value = snapshot.state;
    const now = value.clockOrigin + value.now * 3600000 + performance.now() - syncedAt;
    const day = value.calendarTimezone
      ? new Intl.DateTimeFormat('en-CA', { timeZone: value.calendarTimezone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date(now)).filter(p => ['year','month','day'].includes(p.type)).map(p => [p.type,p.value])
      : null;
    const parts = day && Object.fromEntries(day);
    const key = parts ? `${parts.year}${parts.month}${parts.day}` : new Date(now + value.calendarOffsetMinutes * 60000).toISOString().slice(0,10).replaceAll('-', '');
    if (key !== value.dayKey || !snapshot.testing) refresh(false, true)?.catch(() => {});
  }, 10000);
  request('get').then(start).catch(() => request('load-error'));
})();
if (typeof module !== 'undefined') module.exports = { createManorRefreshInput };
