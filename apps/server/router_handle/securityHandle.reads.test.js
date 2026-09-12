import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({query: vi.fn()}));
vi.mock('../db/index.js', () => ({default: {query}}));
vi.mock('../util/common.js', () => ({resultData: (data = null, status = 200, msg = '') => ({data,status,msg}), snakeCaseKeys: value => value || {}}));
const handlers = await import('./securityHandle.js');
const names = ['getSecurityEvents','getIpReputationList','getAccountBanList'];
const req = () => ({user:{id:'root',role:'root'},body:{pageSize:5,currentPage:2,filters:{key:'needle'}}});
const res = () => ({send:vi.fn()});
it('安全事件无关键词时只从计数省略用户关联，列表仍返回用户字段', async () => {
  query.mockReset();
  query.mockResolvedValueOnce([[{ id: 'event', alias: 'name' }]])
    .mockResolvedValueOnce([[{ total: 1 }]]);
  const request = req();
  request.body.filters = { severity: 'high', blocked: 0 };
  const response = res();
  await handlers.getSecurityEvents(request, response);
  expect(query.mock.calls[0][0]).toContain('LEFT JOIN user u');
  expect(query.mock.calls[0][0].indexOf('LIMIT')).toBeLessThan(query.mock.calls[0][0].indexOf('LEFT JOIN user'));
  expect(query.mock.calls[0][1]).toEqual(['high', 0, 5, 5]);
  expect(query.mock.calls[1][0]).not.toContain('JOIN user');
  expect(query.mock.calls[1][1]).toEqual(['high', 0]);
  expect(response.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { items: [{ alias: 'name' }], total: 1 } });
});
it('安全事件关键词筛选的计数继续保留用户别名和邮箱关联', async () => {
  query.mockReset();
  query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
  await handlers.getSecurityEvents(req(), res());
  expect(query.mock.calls[0][0]).not.toContain('(SELECT e.*');
  expect(query.mock.calls[1][0]).toContain('LEFT JOIN user u');
  expect(query.mock.calls[1][0]).toContain('u.email');
  expect(query.mock.calls[1][1]).toEqual(Array(7).fill('needle'));
});
it('安全事件旧版不分页请求仍完整读取且不产生 LIMIT 参数', async () => {
  query.mockReset();
  query.mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]).mockResolvedValueOnce([[{ total: 2 }]]);
  const request = req();
  request.body = { pageSize: -1, currentPage: 1, filters: {} };
  const response = res();
  await handlers.getSecurityEvents(request, response);
  expect(query.mock.calls[0][0]).not.toContain('(SELECT e.*');
  expect(query.mock.calls[0][0]).not.toContain('LIMIT');
  expect(query.mock.calls[0][1]).toEqual([]);
  expect(response.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { items: [{ id: 1 }, { id: 2 }], total: 2 } });
});
it('白名单保留先列表后总数的读取顺序与完整响应', async () => {
  query.mockReset();
  const list = deferred(), total = deferred();
  query.mockReturnValueOnce(list.promise).mockReturnValueOnce(total.promise);
  const response = res();
  const done = handlers.getSecurityWhitelist(req(), response);
  await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
  expect(response.send).not.toHaveBeenCalled();
  list.resolve([[{ id: 'row' }]]);
  await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(response.send).not.toHaveBeenCalled();
  total.resolve([[{ total: 3 }]]);
  await done;
  expect(response.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { items: [{ id: 'row' }], total: 3 } });
});
function deferred() {
 let resolve,reject;const promise = new Promise((a,b)=>{resolve=a;reject=b;});
 return {promise,resolve,reject};
}
describe.each(names)('%s 并发读取契约', name => {
 beforeEach(()=>{ query.mockReset(); });
 it('鉴权后同时读取，完整结果就绪才响应，保持筛选与分页参数', async ()=>{
  const list=deferred(),total=deferred();query.mockReturnValueOnce(list.promise).mockReturnValueOnce(total.promise);
  const response=res();const done=handlers[name](req(),response);
  await vi.waitFor(()=>expect(query).toHaveBeenCalledTimes(2));
  expect(query.mock.calls[0][1].slice(-2)).toEqual([5,5]);
  expect(query.mock.calls[1][1].length).toBeGreaterThan(0);
  expect(query.mock.calls[1][1].every(value=>value==='needle')).toBe(true);
  total.resolve([[{total:3}]]);await Promise.resolve();expect(response.send).not.toHaveBeenCalled();
  list.resolve([[{id:'row',payload_summary:'invalid',headers_summary:'{}',location:'{"city":"fixture"}',attack_type_breakdown:'{}'}]]);
  await done;expect(response.send.mock.calls[0][0]).toMatchObject({status:200,data:{items:[{id:'row'}],total:3}});
  if(name==='getSecurityEvents')expect(response.send.mock.calls[0][0].data.items[0].payload_summary).toEqual({});
  if(name==='getIpReputationList')expect(response.send.mock.calls[0][0].data.items[0].city).toBe('fixture');
 });
 it('无权限不查数据库',async()=>{
  const request=req();request.user.role='user';const response=res();await handlers[name](request,response);
  expect(query).not.toHaveBeenCalled();expect(response.send.mock.calls[0][0].status).toBe(403);
 });
 it('多个查询失败保留原首个错误',async()=>{
  const first=deferred(),second=deferred();query.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const response=res();const done=handlers[name](req(),response);
  await vi.waitFor(()=>expect(query).toHaveBeenCalledTimes(2));second.reject(new Error('second'));
  await Promise.resolve();expect(response.send).not.toHaveBeenCalled();first.reject(new Error('first'));await done;
  expect(response.send.mock.calls[0][0]).toMatchObject({status:500,data:null});
  expect(response.send.mock.calls[0][0].msg).toContain('first');
 });
});
