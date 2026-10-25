"""Encode first-screen UI atlases under new immutable names, preserving alpha and measured UI detail."""
from pathlib import Path
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[2]/'public/manor/knowledge-garden-v19'
FILES={'farm/game-ui-r20.webp':'farm/game-ui-r53.webp','garden-tools.webp':'garden-tools-r53.webp','farm/plot-canvas-r23.webp':'farm/plot-canvas-r53.webp','farm/purifier-states-r22.webp':'farm/purifier-states-r53.webp','farm/purifier-plinth-r36.webp':'farm/purifier-plinth-r53.webp','farm/workshop-states-r33.webp':'farm/workshop-states-r53.webp','farm/hive-states-r33.webp':'farm/hive-states-r53.webp','courtyard/pc-sky-bleed-r37.webp':'courtyard/pc-sky-bleed-r53.webp'}
SIZES={'farm/game-ui-r20.webp':(1320,660),'garden-tools.webp':(768,512),'farm/plot-canvas-r23.webp':(768,768),'farm/purifier-states-r22.webp':(1024,1024),'farm/purifier-plinth-r36.webp':(768,512),'farm/workshop-states-r33.webp':(1320,660),'farm/hive-states-r33.webp':(1320,660)}
for old,new in FILES.items():
 im=Image.open(ROOT/old)
 if old in SIZES:im=im.resize(SIZES[old],Image.Resampling.LANCZOS)
 im.save(ROOT/new,quality=90,method=6,alpha_quality=100)
 # Quality evidence at the delivered size. Atlas UVs / CSS geometry use proportions, not file dimensions.
 before=np.asarray(im.convert('RGB'),dtype=float);after=np.asarray(Image.open(ROOT/new).convert('RGB'),dtype=float)
 print(old,(ROOT/old).stat().st_size,'->',(ROOT/new).stat().st_size,'RGB mean error',round(abs(before-after).mean(),2))
