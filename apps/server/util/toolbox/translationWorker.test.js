import {describe,it,expect,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../aiSkill/runtime.js',()=>({executeAiSkill:execute}));
import {executeTranslationJob} from './translationWorker.js';
describe('translation delivery fence',()=>{
 it('commits the complete paired artifact inside the same execution before settlement',async()=>{
  const db={query:vi.fn().mockResolvedValue([[{content:'Original',segments_json:'[]'}]])};
  const commit=vi.fn().mockResolvedValue(true), beforeSegment=vi.fn();
  execute.mockImplementation(async(request,identity,deps)=>{
   expect(request.scope.resourceRefs).toEqual([]);expect(request.input.text).toBe('Original');
   expect(deps.internalCaller).toBe('toolbox_worker');expect(identity.user.id).toBe('u');
   await deps.skillDependencies.beforeSegment(0,1);
   deps.skillDependencies.onTranslated([{id:'1',original:'Original',translated:'译文'}]);
   await deps.commitValidatedResult({response:{result:{content:'译文'},coverage:{complete:true}}});
   expect(commit).toHaveBeenCalledTimes(1);
  });
  const job={id:'j',user_id:'u',options_json:{targetLanguage:'zh-CN',sourceLanguage:'auto'}};
  await expect(executeTranslationJob(job,{user:{id:'u'}},db,{requestId:'request',beforeSegment,commit})).resolves.toEqual({persisted:true});
  expect(commit.mock.calls[0][0]).toMatchObject({type:'translation',title:'简体中文译文',meta:{translation:{segments:[{original:'Original',translated:'译文'}]}}});
  commit.mockResolvedValue(false);
  await expect(executeTranslationJob(job,{user:{id:'u'}},db,{requestId:'request',beforeSegment,commit})).rejects.toMatchObject({code:'TOOLBOX_LEASE_LOST'});
 });
 it('cannot execute when a cancelled, expired or deleted source snapshot is missing',async()=>{
  execute.mockClear();
  await expect(executeTranslationJob({id:'j',user_id:'u'},{user:{id:'u'}},{query:async()=>[[]]},{requestId:'r'})).rejects.toMatchObject({code:'TOOLBOX_TRANSLATION_INPUT_UNAVAILABLE'});
  expect(execute).not.toHaveBeenCalled();
 });
});
