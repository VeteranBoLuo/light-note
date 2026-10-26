// @vitest-environment node
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const root = new URL('../../../public/manor/knowledge-garden-v19/', import.meta.url);
const cal = runInNewContext(`${readFileSync(new URL('farm-calibration.js', root), 'utf8')};FARM_CAL`);
// Read the delivered RGBA PNG, including all PNG row filters. No browser or optional image codec is needed.
function rgbaPNG(path: string) {
  const file=readFileSync(new URL(path,root)); const width=file.readUInt32BE(16),height=file.readUInt32BE(20);
  expect(file[24]).toBe(8);expect(file[25]).toBe(6);expect(file[28]).toBe(0);
  const chunks: Buffer[]=[];
  for(let offset=8;offset<file.length;){const n=file.readUInt32BE(offset);if(file.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(file.subarray(offset+8,offset+8+n));offset+=n+12;}
  const raw=inflateSync(Buffer.concat(chunks)),pixels=new Uint8Array(width*height*4),stride=width*4;
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
    const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;
    const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
    const filter=raw[y*(stride+1)];const predictors=[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:c];
    pixels[i]=(raw[y*(stride+1)+x+1]+predictors[filter])&255;
  }
  return {width,height,pixel:(x:number,y:number)=>[...pixels.slice((Math.floor(y)*width+Math.floor(x))*4,(Math.floor(y)*width+Math.floor(x))*4+4)]};
}
describe('预生成庄园水面',()=>{
  it('三个端型发布完整固定场景和对应水场，运行时不再组合高清贴片',()=>{
    for(const key of ['desktop','mobileGarden','mobileBay']){
      const scene=cal[key];expect(scene.detailTiles||[]).toEqual([]);
      for(const path of [scene.asset,scene.water,scene.smooth])expect(readFileSync(new URL(path,root)).length).toBeGreaterThan(1000);
      const mask=rgbaPNG(scene.water);expect(mask.width).toBeLessThanOrEqual(1536);
      expect(mask.width/mask.height).toBeCloseTo(scene.image[0]/scene.image[1],2);
    }
  });
  it('海面与钓鱼水域可动，鱼舱顶部和石板广场严格排除',()=>{
    const scene=cal.desktop,mask=rgbaPNG(scene.water);
    const point=(x:number,y:number)=>mask.pixel(x*mask.width/scene.image[0],y*mask.height/scene.image[1]);
    expect(point(1300,300)[0]).toBe(255);
    expect(point(400,1600)[0]).toBe(255);
    const [fx,fy]=scene.pier.frogSplash;
    expect(point(fx,fy)[0]).toBe(255);
    expect(point(2800,700)[0]).toBe(0);
    expect(point(1500,1300)[0]).toBe(0);
  });
  it('移动端船帆、船体和蓝色描边不会被当成海水变形',()=>{
    const scene=cal.mobileGarden,mask=rgbaPNG(scene.water);
    for(const [x,y] of [[371,310],[371,352],[488,348],[386,331]])
      expect(mask.pixel(x*mask.width/scene.image[0],y*mask.height/scene.image[1])[0]).toBe(0);
  });
  it('高分屏按真实显示尺寸渲染，波场连续推进而不是整体反向移动或扩散圆环',()=>{
    const module={exports:{} as {renderSize:(w:number,h:number,dpr:number)=>{width:number;height:number};swellField:(n:number,rng:()=>number)=>{update:(t:number)=>Float32Array}}};
    runInNewContext(readFileSync(new URL('garden-environment-r53.js',root),'utf8'),{module});
    const water=module.exports;
    expect(water.renderSize(1470,700,2)).toEqual({width:2940,height:1400});
    const waves=water.swellField(10,()=>.5),a=[...waves.update(0)],b=[...waves.update(.1)],c=[...waves.update(.2)];
    for(let i=0;i<10;i++){expect(b[i*4+3]).toBeGreaterThan(a[i*4+3]);expect(c[i*4+3]-b[i*4+3]).toBeCloseTo(b[i*4+3]-a[i*4+3],5);}
  });
});
