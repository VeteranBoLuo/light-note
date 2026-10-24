/* No account data: only painted bitmaps, calibrated positions and water categories. */
self.onmessage=async event=>{
  const {environmentURL,data}=event.data;
  try {
    const url=new URL(environmentURL);
    if(url.origin!==self.location.origin)throw Error('origin');
    importScripts(url.href);
    const result=await GardenEnvironment.prepareTextures(data);
    const source=result.source.transferToImageBitmap(),smooth=result.smooth.transferToImageBitmap();
    self.postMessage({...result,source,smooth},[source,smooth,result.pixels.buffer]);
  } catch {
    self.postMessage({error:true});
  } finally {
    for(const image of [data.image,data.mask,...data.details.map(d=>d.image)])image.close();
  }
};
