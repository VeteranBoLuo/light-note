import assert from 'node:assert/strict';
import { test } from 'node:test';
import { styleContexts } from './density-style-context.mjs';
const at = (source, needle) => styleContexts(source,[source.indexOf(needle)]).get(source.indexOf(needle));
test('preserves nested selectors and breakpoint scope, then exits it',()=>{
 const css='.page { gap: 12px; @media (max-width: 767px) { &.mobile { width: 40px; } } height: 60px; }';
 assert.deepEqual(at(css,'width: 40px'),['.page','@media (max-width: 767px)','&.mobile']);
 assert.deepEqual(at(css,'height:'),['.page']);
});
test('comments, strings and escaped quotes do not create blocks',()=>{
 const css=String.raw`/* { */ .a { content: "{ \" }"; // }
 .b { width: 10px; } } .c { height: 20px; }`;
 assert.deepEqual(at(css,'width:'),['.a','.b']);
 assert.deepEqual(at(css,'height:'),['.c']);
});
test('Less interpolation stays in the selector and duplicate unsorted offsets are supported',()=>{
 const css='.@{prefix} { width: 20px; .child { height: 30px; } }';
 const w=css.indexOf('width:'),h=css.indexOf('height:');
 const result=styleContexts(css,[h,w,h]);
 assert.deepEqual(result.get(w),['.@{prefix}']);assert.deepEqual(result.get(h),['.@{prefix}','.child']);
});
test('keeps at-rule conditions as evidence instead of inferring exemptions',()=>{
 const css='@supports (display: grid) { @media (min-width: 1200px) { .toolbar { gap: 10px; } } }';
 assert.deepEqual(at(css,'gap:'),['@supports (display: grid)','@media (min-width: 1200px)','.toolbar']);
});
