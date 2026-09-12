import { beforeEach, describe, expect, it, vi } from 'vitest';
const {query} = vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../db/index.js',()=>({default:{query}}));
vi.mock('../util/common.js',()=>({resultData:(data=null,status=200,msg='')=>({data,status,msg}),snakeCaseKeys:value=>value||{}}));
vi.mock('../util/knowledgeService.js',()=>({invalidateKnowledgeCache:vi.fn()}));
const {listKnowledgeBase} = await import('./knowledgeBaseHandle.js');
const req=()=>({user:{id:'root',role:'root'},body:{pageSize:5,currentPage:2,filters:{category:'fixture',status:'public'}}});
const res=()=>({send:vi.fn()});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
describe('知识库列表权限与并发读取',()=>{
 beforeEach(()=>{query.mockReset();});
 it('先核验数据库权限，再同时读取；完整结果就绪才返回',async()=>{
  const auth=deferred(),list=deferred(),count=deferred();query.mockReturnValueOnce(auth.promise).mockReturnValueOnce(list.promise).mockReturnValueOnce(count.promise);
  const response=res();const done=listKnowledgeBase(req(),response);
  expect(query).toHaveBeenCalledTimes(1);auth.resolve([[{role:'root'}]]);
  await vi.waitFor(()=>expect(query).toHaveBeenCalledTimes(3));
  expect(query.mock.calls[1][1]).toEqual(['fixture','public',5,5]);expect(query.mock.calls[2][1]).toEqual(['fixture','public']);
  count.resolve([[{total:9}]]);await Promise.resolve();expect(response.send).not.toHaveBeenCalled();
  list.resolve([[{id:'item'}]]);await done;expect(response.send).toHaveBeenCalledWith({status:200,msg:'',data:{items:[{id:'item'}],total:9}});
 });
 it('数据库权限被收回时不查询知识库',async()=>{
  query.mockResolvedValueOnce([[{role:'user'}]]);const response=res();await listKnowledgeBase(req(),response);
  expect(query).toHaveBeenCalledTimes(1);expect(response.send.mock.calls[0][0].status).toBe(403);
 });
 it('多个读取失败保留列表错误优先级',async()=>{
  query.mockResolvedValueOnce([[{role:'root'}]]).mockRejectedValueOnce(new Error('list failed')).mockRejectedValueOnce(new Error('count failed'));
  const response=res();await listKnowledgeBase(req(),response);expect(response.send).toHaveBeenCalledWith({status:500,data:null,msg:'服务器内部错误: list failed'});
 });
 it('空列表和零总量保持响应形状',async()=>{
  query.mockResolvedValueOnce([[{role:'root'}]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{total:0}]]);
  const response=res();await listKnowledgeBase(req(),response);expect(response.send.mock.calls[0][0].data).toEqual({items:[],total:0});
 });
});
