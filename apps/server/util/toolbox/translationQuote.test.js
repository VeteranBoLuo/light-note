import {describe,it,expect,vi} from 'vitest';
import {insertTranslationQuote} from './translationQuote.js';
describe('translation quote snapshots',()=>{
 it('keeps text outside quote metadata and reuses a stable request',async()=>{
  let existing=null;
  const connection={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),query:vi.fn(async(sql,args)=>{
   if(sql.startsWith('SELECT id FROM user'))return [[{id:'u'}]];
   if(sql.startsWith('SELECT * FROM toolbox_quotes'))return [existing?[existing]:[]];
   if(sql.startsWith('INSERT INTO toolbox_quotes'))existing=args[0];
   return [{affectedRows:1}];
  })};
  const database={getConnection:async()=>connection};
  const resolved={inputDigest:'digest',snapshot:{translation:{characters:15},options:{targetLanguage:'en'}},translation:{text:'private original',segments:[{id:'1',original:'private original'}]}};
  const input={database,userId:'u',requestId:'stable',resolved,ttlMs:60000};
  const first=await insertTranslationQuote(input),second=await insertTranslationQuote(input);
  expect(second.id).toBe(first.id);
  expect(first.billing_medium).toBe('ai_quota');expect(first.quoted_points).toBe(0);
  expect(first.input_snapshot_json).not.toContain('private original');
  expect(connection.query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO toolbox_translation_inputs'))).toHaveLength(1);
  await expect(insertTranslationQuote({...input,resolved:{...resolved,inputDigest:'changed'}})).rejects.toMatchObject({code:'TOOLBOX_IDEMPOTENCY_KEY_REUSED'});
  expect(connection.rollback).toHaveBeenCalledTimes(1);
 });
});
