"""Compile the calibrated, fixed scene graph once, at its original resolution.
No browser-side scene composition, image readback or shoreline search is needed.
Inputs remain immutable; use a new revision when changing the scene graph.
Requires Pillow and numpy (asset-generation tools, not a production dependency).
"""
from pathlib import Path
import argparse, json, math, xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[2]/'public/manor/knowledge-garden-v19'
REV='r56'
scenes=json.loads(Path(__file__).with_name('scene-plates.json').read_text())
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene',choices=list(scenes),help='Recompile only the changed scene; keep other published assets immutable.')
args=parser.parse_args()
def image(path):
 p=ROOT/path
 # Use the lossless source painting where one exists.
 return Image.open(p.with_suffix('.png') if p.with_suffix('.png').exists() else p).convert('RGBA')
def feather(size,horizontal=.04,vertical=.05):
 w,h=size;x=np.minimum(np.arange(w)/max(1,w*horizontal),(w-1-np.arange(w))/max(1,w*horizontal))
 y=np.minimum(np.arange(h)/max(1,h*vertical),(h-1-np.arange(h))/max(1,h*vertical))
 return Image.fromarray((np.clip(y[:,None],0,1)*np.clip(x[None,:],0,1)*255).astype('uint8'))
def composite(scene):
 size=tuple(scene['image']); out=image(scene['asset']).resize(size,Image.Resampling.LANCZOS)
 for tile in scene.get('detailTiles',[]):
  im=image(tile['asset'])
  if tile.get('sourceRect'): im=im.crop(tuple(tile['sourceRect']))
  im=im.resize(tuple(tile['pixels']),Image.Resampling.LANCZOS)
  alpha=feather(im.size);im.putalpha(alpha)
  a,b,c,d,e,f=tile['matrix'];det=a*d-b*c
  plate=im.transform(size,Image.Transform.AFFINE,(d/det,-c/det,(c*f-d*e)/det,-b/det,a/det,(b*e-a*f)/det),Image.Resampling.BICUBIC)
  clip=Image.new('L',size);ImageDraw.Draw(clip).polygon([tuple(p) for p in tile['clip']],fill=255)
  # Small inward feather removes visible polygon seams without washing out the plate.
  clip=clip.filter(ImageFilter.GaussianBlur(tile.get("feather",3)))
  plate.putalpha(Image.fromarray((np.asarray(plate.getchannel('A'),dtype='uint16')*np.asarray(clip)/255).astype('uint8')))
  out=Image.alpha_composite(out,plate)
 return out.convert('RGB')
def water_mask(scene,paint):
 width=min(1536,paint.width);height=round(paint.height*width/paint.width);size=(width,height)
 path=ROOT/scene['water']
 if path.suffix=='.svg':
  tree=ET.parse(path);native=Image.new('RGBA',tuple(scene['image']),(0,0,0,255));draw=ImageDraw.Draw(native)
  for polygon in tree.getroot():
   pts=[tuple(map(float,p.split(','))) for p in polygon.attrib['points'].split()];draw.polygon(pts,fill=polygon.attrib['fill'])
  field=native.resize(size,Image.Resampling.NEAREST)
 else: field=Image.open(path).convert('RGBA').resize(size,Image.Resampling.NEAREST)
 arr=np.array(field);rgb=np.asarray(paint.resize(size,Image.Resampling.LANCZOS),dtype='int16')
 blue=(rgb[:,:,2]-rgb[:,:,0]>12)&(rgb[:,:,1]-rgb[:,:,0]>6)&(rgb[:,:,2]>rgb[:,:,1]*.85)&(rgb[:,:,1]>40)
 adjacent=np.asarray(Image.fromarray(blue.astype('uint8')*255).filter(ImageFilter.MaxFilter(5)))>0
 white=(rgb[:,:,0]>140)&(rgb[:,:,1]>150)&(rgb[:,:,2]>105)
 wet=(arr[:,:,0]>128)&(arr[:,:,1]<128)&(arr[:,:,2]<128)&(blue|(white&adjacent))
 # Painted sails and hulls must stay still, including their blue edge pixels.
 # Color classification alone cannot distinguish blue sail trim from sea water.
 dry=Image.new('L',size);draw=ImageDraw.Draw(dry)
 for polygon in scene.get('waterExclusions',[]):
  draw.polygon([(x*width/paint.width,y*height/paint.height) for x,y in polygon],fill=255)
 wet&=np.asarray(dry)==0
 arr[~wet,:3]=0
 # Distance to shore is baked, so it never runs on the browser's input thread.
 alive=Image.fromarray(wet.astype('uint8')*255);distance=np.zeros((height,width),dtype='uint8')
 for i in range(32):
  distance+=(np.asarray(alive)>0).astype('uint8');alive=alive.filter(ImageFilter.MinFilter(3))
 arr[:,:,3]=(distance.astype('float32')/32*255).astype('uint8')
 return Image.fromarray(arr)
for key,scene in scenes.items():
 if args.scene and key!=args.scene: continue
 rev=scene.get('revision',REV)
 name={'desktop':'pc','mobileGarden':'mobile-garden','mobileBay':'mobile-bay'}[key]
 paint=composite(scene);paint.save(ROOT/f'courtyard/{name}-scene-{rev}.webp',quality=96,method=6)
 if key=='desktop':
  for width in [2048,2940]:
   paint.resize((width,round(paint.height*width/paint.width)),Image.Resampling.LANCZOS).save(ROOT/f'courtyard/{name}-scene-{width}-{rev}.webp',quality=96,method=6)
 mask=water_mask(scene,paint);mask.save(ROOT/f'courtyard/{name}-water-{rev}.png',optimize=True)
 # Low frequencies used only for refraction cancellation, not visible scene art.
 w=min(1536,paint.width);smooth=paint.resize((w,round(paint.height*w/paint.width)),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(5))
 smooth.save(ROOT/f'courtyard/{name}-smooth-{rev}.webp',quality=85,method=6)
 print(name,paint.size,(ROOT/f'courtyard/{name}-scene-{rev}.webp').stat().st_size)
