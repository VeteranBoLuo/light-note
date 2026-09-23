// Read structural context without evaluating Less or changing authored dimensions.
// Offsets refer to the original source. Strings/comments cannot create CSS blocks.
export function styleContexts(source, offsets) {
  const contexts = new Map(), stack = [];
  let cursor = 0, boundary = 0, quote = '', comment = '';
  const header = (end) => source.slice(boundary, end)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim().replace(/\s+/g, ' ');
  for (const offset of [...new Set(offsets)].sort((a,b)=>a-b)) {
    while (cursor < offset) {
      const c=source[cursor],next=source[cursor+1];
      if(comment==='line'){if(c==='\n')comment='';cursor++;continue;}
      if(comment==='block'){if(c==='*'&&next==='/'){comment='';cursor+=2;}else cursor++;continue;}
      if(quote){if(c==='\\'){cursor+=2;continue;}if(c===quote)quote='';cursor++;continue;}
      if(c==='/'&&next==='*'){comment='block';cursor+=2;continue;}
      if(c==='/'&&next==='/'){comment='line';cursor+=2;continue;}
      if(c==='"'||c==="'"){quote=c;cursor++;continue;}
      if(c==='@'&&next==='{'){const end=source.indexOf('}',cursor+2);cursor=end<0?source.length:end+1;continue;}
      if(c==='{'){stack.push(header(cursor));boundary=cursor+1;}
      else if(c==='}'){stack.pop();boundary=cursor+1;}
      else if(c===';')boundary=cursor+1;
      cursor++;
    }
    contexts.set(offset,[...stack]);
  }
  return contexts;
}
