import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/manor/manor-live.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

async function setup(testing = false) {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = '<div id="modal" hidden></div><aside id="tankProduction" hidden></aside><button data-action="fish-detail">鱼</button><button data-action="dialog-back">返回</button><button data-action="pickPoop">拾取</button>';
  Object.defineProperty(doc, 'currentScript', { value: { dataset: { uiScript: '/ui.js' } } });
  Object.defineProperty(doc, 'hidden', { value: false, writable: true });
  const post = vi.fn(), parent = { postMessage: post };
  const win = Object.assign(new EventTarget(), { parent });
  const state = { now: 0, clockOrigin: Date.now(), dayKey: new Date().toISOString().slice(0, 10).replaceAll('-', ''), calendarOffsetMinutes: 0,casting:false,
    discoveries: { blue: 1, clown: 1 }, atlasRead: {} as Record<string, boolean>, fert: { rabbit: 0 }, poopPickedDay: null as number | null };
  const snapshot = (revision = 0) => ({ state: structuredClone(state), quests: [], revision, testing });
  const model = { create: () => state, atlasEntryUnread: (target: typeof state, type: string, key: string) => !target.atlasRead[`${type}:${key}`] };
  const update = vi.fn(), clocks = vi.fn(), inventory = vi.fn();
  let ui!: HTMLScriptElement;
  const append = doc.body.append.bind(doc.body);
  doc.body.append = (...nodes) => { ui = nodes[0] as HTMLScriptElement; append(...nodes); };
  const network = { onLine: true };
  const closeTank = vi.fn(() => { doc.getElementById('tankProduction')!.hidden = true; doc.dispatchEvent(new Event('manor-overlay-change')); });
  const backFromDialog = vi.fn();
  const toast=vi.fn(),closeDialog=vi.fn();
  const runtime={ window: win, document: doc, location: { origin: 'http://localhost', search: '?bridge=test' },
    URLSearchParams, structuredClone, performance, Date, navigator: network, setTimeout, clearTimeout, setInterval,
    MutationObserver, GardenModel: model, state, FISH: {}, FarmStage: { profile: () => 'desktop' },
    update, refreshClocks: clocks, FarmUI: { refreshInventory: inventory }, closeTankManagement: closeTank, backFromDialog,
    toast,closeDialog,fishingPhase:'idle' };
  runInNewContext(source,runtime);
  const reply = async (action: string, value?: unknown, error?: string,errorCode?:string) => {
    const call = [...post.mock.calls].reverse().find(([data]) => data.action === action)![0];
    const event = new Event('message');
    Object.assign(event, { source: parent, origin: 'http://localhost', data: { type: 'lightnote-manor-reply', nonce: 'test', id: call.id, value, error,errorCode } });
    win.dispatchEvent(event); await flush();
  };
  await reply('get', snapshot());
  await ui.onload!(new Event('load'));
  const calls = (action: string) => post.mock.calls.filter(([data]) => data.action === action).map(([data]) => data);
  const back = async () => {
    const event = new Event('message');
    Object.assign(event, { source: parent, origin: 'http://localhost', data: { type: 'lightnote-manor-control', nonce: 'test', action: 'close-dialog' } });
    win.dispatchEvent(event);await flush();
  };
  return { doc, win, network, state, model: model as typeof model & { readAtlasEntry: (s: typeof state, type: string, key: string) => Promise<boolean>;pickPoop:(s:typeof state)=>Promise<boolean> },
    calls, reply, snapshot, update, clocks, inventory, back, closeTank, backFromDialog,toast,closeDialog,runtime };
}

it('鱼舱折叠面板登记同一返回栈，手势返回只关闭面板，不退出庄园', async () => {
  const s = await setup();
  s.doc.getElementById('tankProduction')!.hidden = false;
  s.doc.dispatchEvent(new Event('manor-overlay-change'));await flush();
  expect(s.calls('dialog').map(call => call.payload.open)).toEqual([true]);
  await s.back();
  expect(s.closeTank).toHaveBeenCalledOnce();
  expect(s.calls('dialog').map(call => call.payload.open)).toEqual([true, false]);
  expect(s.doc.getElementById('tankProduction')!.hidden).toBe(true);
  expect(s.calls('exit')).toHaveLength(0);
});

it('鱼舱交接详情不重复进出返回栈，详情返回仍可保留下一层', async () => {
  const s = await setup(), panel = s.doc.getElementById('tankProduction')!, modal = s.doc.getElementById('modal')!;
  panel.hidden = false;s.doc.dispatchEvent(new Event('manor-overlay-change'));await flush();
  panel.hidden = true;s.doc.dispatchEvent(new Event('manor-overlay-change'));modal.hidden = false;await flush();
  expect(s.calls('dialog').map(call => call.payload.open)).toEqual([true]);
  await s.back();
  expect(s.backFromDialog).toHaveBeenCalledOnce();
  expect(s.closeTank).not.toHaveBeenCalled();
  expect(s.calls('dialog').map(call => call.payload.open)).toEqual([true, true]);
  modal.hidden = true;await flush();
  expect(s.calls('dialog').at(-1).payload.open).toBe(false);
});

it('已读写入串行进行，慢响应期间详情和返回仍可点击，资产操作不并发提交', async () => {
  const s = await setup();
  const first = s.model.readAtlasEntry(s.state, 'fish', 'blue'); await flush();
  const second = s.model.readAtlasEntry(s.state, 'fish', 'clown'); await flush();
  expect(s.calls('command')).toHaveLength(1);
  const click = vi.fn(); s.doc.addEventListener('click', click);
  s.doc.querySelector<HTMLButtonElement>('[data-action="fish-detail"]')!.click();
  s.doc.querySelector<HTMLButtonElement>('[data-action="dialog-back"]')!.click();
  s.doc.querySelector<HTMLButtonElement>('[data-action="pickPoop"]')!.click();
  expect(click).toHaveBeenCalledTimes(2);
  const next = s.snapshot(1);next.state.atlasRead['fish:blue'] = true;
  await s.reply('command', { ...next, result: true }); await first;
  expect(s.calls('command')).toHaveLength(2);
  expect(s.calls('command')[1].payload).toMatchObject({ args: ['fish', 'clown'], revision: 1 });
  const last = s.snapshot(2);last.state.atlasRead['fish:clown'] = true;
  await s.reply('command', { ...last, result: true }); await second;
});

it('可见正式庄园每 30 秒被动校准其他端的肥料和粪便，并刷新背包；仅时钟变更不重画控件', async () => {
  const s = await setup();
  await vi.advanceTimersByTimeAsync(20000);
  expect(s.calls('get')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(10000);
  expect(s.calls('get')).toHaveLength(2);
  expect(s.calls('get')[1].payload.background).toBe(true);
  const next = s.snapshot(1);next.state.fert.rabbit = 1;next.state.poopPickedDay = 1;
  await s.reply('get', next);
  expect(s.state.fert.rabbit).toBe(1); expect(s.state.poopPickedDay).toBe(1);
  expect(s.update).toHaveBeenCalledOnce();expect(s.inventory).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30000);
  await s.reply('get', { ...next, state: { ...next.state, now: 1 } });
  expect(s.update).toHaveBeenCalledOnce();expect(s.clocks).toHaveBeenCalledOnce();
});

it('隐藏、离线和独立测试存档不发起跨设备轮询', async () => {
  const s = await setup();
  Object.defineProperty(s.doc, 'hidden', { value: true });
  await vi.advanceTimersByTimeAsync(20000);expect(s.calls('get')).toHaveLength(1);
  Object.defineProperty(s.doc, 'hidden', { value: false });s.network.onLine = false;
  await vi.advanceTimersByTimeAsync(20000);expect(s.calls('get')).toHaveLength(1);
  const test = await setup(true);
  await vi.advanceTimersByTimeAsync(20000);expect(test.calls('get')).toHaveLength(1);
});

it('冲突响应携带最新资产时立即同步，不重复发送旧操作或再读取一次',async()=>{
  const s=await setup();
  const pending=s.model.pickPoop(s.state).catch(error=>error);await flush();
  const next=s.snapshot(2);next.state.poopPickedDay=1;next.state.fert.rabbit=1;
  await s.reply('command',next,'已同步最新状态','MANOR_REVISION_CONFLICT');
  const error=await pending;
  expect(s.state).toMatchObject({poopPickedDay:1,fert:{rabbit:1}});
  expect(s.update).toHaveBeenCalledOnce();expect(s.inventory).toHaveBeenCalledOnce();
  const event=new Event('unhandledrejection',{cancelable:true});Object.assign(event,{reason:error});s.win.dispatchEvent(event);await flush();
  expect(event.defaultPrevented).toBe(true);
  expect(s.toast).toHaveBeenCalledWith('已同步最新状态',{topCenter:true});
  expect(s.calls('command')).toHaveLength(1);expect(s.calls('get')).toHaveLength(1);
});

it('离线阻止新资产操作，恢复连接即刻读取并更新另一端已领取状态',async()=>{
  const s=await setup();s.network.onLine=false;
  await expect(s.model.pickPoop(s.state)).rejects.toMatchObject({code:'MANOR_OFFLINE'});
  expect(s.calls('command')).toHaveLength(0);
  s.network.onLine=true;s.win.dispatchEvent(new Event('online'));await flush();
  expect(s.calls('get')).toHaveLength(2);
  const next=s.snapshot(3);next.state.poopPickedDay=1;await s.reply('get',next);
  expect(s.state.poopPickedDay).toBe(1);
});

it('本端钓鱼动画期间不重画，另一端进行中的钓鱼状态不阻断后续校准',async()=>{
  const s=await setup();s.state.casting=true;s.runtime.fishingPhase='wait';
  await vi.advanceTimersByTimeAsync(30000);expect(s.calls('get')).toHaveLength(1);
  s.runtime.fishingPhase='idle';
  await vi.advanceTimersByTimeAsync(30000);expect(s.calls('get')).toHaveLength(2);
  const next=s.snapshot(4);next.state.casting=false;await s.reply('get',next);
  expect(s.state.casting).toBe(false);
});

it('旧读取响应不回退已确认的存档，非庄园异常不触发资产恢复',async()=>{
  const s=await setup();await vi.advanceTimersByTimeAsync(30000);await s.reply('get',s.snapshot(4));
  await vi.advanceTimersByTimeAsync(30000);const old=s.snapshot(1);old.state.fert.rabbit=99;await s.reply('get',old);
  expect(s.state.fert.rabbit).toBe(0);
  const event=new Event('unhandledrejection',{cancelable:true});Object.assign(event,{reason:new Error('unrelated')});s.win.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);expect(s.toast).not.toHaveBeenCalled();
  expect(s.calls('get')).toHaveLength(3);
});

it('另一端钓鱼中点击资产操作先同步，不静默卡住或提交新操作',async()=>{
  const s=await setup(),click=vi.fn();s.state.casting=true;
  s.doc.querySelector('[data-action="pickPoop"]')!.addEventListener('click',click);
  (s.doc.querySelector('[data-action="pickPoop"]') as HTMLButtonElement).click();await flush();
  expect(click).not.toHaveBeenCalled();expect(s.calls('command')).toHaveLength(0);
  expect(s.calls('get')).toHaveLength(2);
  const next=s.snapshot(2);next.state.casting=false;await s.reply('get',next);
  expect(s.state.casting).toBe(false);expect(s.toast).toHaveBeenCalledWith(expect.any(String),{topCenter:true});
});
