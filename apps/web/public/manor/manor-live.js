/* Account state and points are owned by the host's authenticated API, never this scene. */
(() => {
  const nonce = new URLSearchParams(location.search).get('bridge');
  const uiScript = document.currentScript.dataset.uiScript;
  if (!nonce || window.parent === window) return;
  let snapshot, busy = false, sequence = 0, ready = false, refreshing = null, syncedAt = performance.now();
  const waiting = new Map();
  const origin = location.origin;
  const request = (action, payload = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    waiting.set(id, { resolve, reject });
    window.parent.postMessage({ type: 'lightnote-manor', nonce, id, action, payload }, origin);
  });
  const apply = (target, next) => {
    for (const name of Object.keys(target)) if (!(name in next)) delete target[name];
    Object.assign(target, next);
  };
  const send = async (target, action, args) => {
    if (busy) throw new Error('庄园操作正在处理中');
    busy = true;
    document.documentElement.setAttribute('aria-busy', 'true');
    try {
      if (refreshing) await refreshing;
      const next = await request('command', { action, args });
      snapshot = next; syncedAt = performance.now();
      apply(target, next.state);
      return next.result;
    } finally {
      busy = false;
      document.documentElement.removeAttribute('aria-busy');
    }
  };
  const methods = ['adopt','plant','water','harvest','fertilize','remove','buySeed','sellCrop','sellAllCrops',
    'convertBait','buyBait','buyFry','beginCast','resolveCast','selectBait','sell','release','buyback',
    'place','placeShow','unplace','fillEmptySlots','collect','collectSlot','pickPoop','deliverBirdSeed','pickBirdSeed',
    'buyPurifier','claimPurifier','buyFacility','upgradePurifier','startCraft','collectCraft','refillPollen',
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
        return send(target, name, args);
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
      let open = !modal.hidden;
      if (open) request('dialog', { open });
      new MutationObserver(() => {
        const next = !modal.hidden;
        if (next !== open) { open = next; request('dialog', { open }); }
      }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
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
    tasks: () => request('tasks'),
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
      if (data.action === 'close-dialog') closeDialog();
      else if (data.action === 'open-ledger') ledgerDialog();
      else if (data.action === 'back') {
        if (!document.getElementById('modal').hidden) closeDialog(); else requestManorExit();
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
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]');
    if (busy && action && action.dataset.action !== 'exit') {
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
  const refresh = (recover = false) => {
    if (!ready || document.hidden || busy || state.casting && !recover || refreshing) return;
    refreshing = request('get').then(next => {
      snapshot = next; syncedAt = performance.now(); apply(state, next.state); update();
    }).finally(() => { refreshing = null; });
    return refreshing;
  };
  document.addEventListener('visibilitychange', () => { refresh()?.catch(() => {}); });
  window.addEventListener('focus', () => { refresh()?.catch(() => {}); });
  // Check the account day locally; only crossing midnight makes an API request.
  setInterval(() => {
    if (!ready || document.hidden) return;
    const value = snapshot.state;
    const now = value.clockOrigin + value.now * 3600000 + performance.now() - syncedAt;
    const day = value.calendarTimezone
      ? new Intl.DateTimeFormat('en-CA', { timeZone: value.calendarTimezone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date(now)).filter(p => ['year','month','day'].includes(p.type)).map(p => [p.type,p.value])
      : null;
    const parts = day && Object.fromEntries(day);
    const key = parts ? `${parts.year}${parts.month}${parts.day}` : new Date(now + value.calendarOffsetMinutes * 60000).toISOString().slice(0,10).replaceAll('-', '');
    if (key !== value.dayKey) refresh()?.catch(() => {});
  }, 60000);
  request('get').then(start).catch(() => request('load-error'));
})();
